import WebSocket from "ws";
import { createLogger } from "@/lib/logger";

const log = createLogger("gemini-live");

const GEMINI_LIVE_MODEL =
  process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview";

export interface GeminiLiveCallbacks {
  /** Raw PCM 24kHz audio chunk from Gemini to forward to browser */
  onAudio: (pcmBuffer: Buffer) => void;
  /** Gemini wants to call a tool — execute and return result */
  onToolCall: (
    id: string,
    name: string,
    args: Record<string, any>
  ) => Promise<Record<string, any>>;
  /** Model started a new turn */
  onTurnStart: () => void;
  /** Model finished its turn */
  onTurnEnd: () => void;
  /** Input transcription from Gemini VAD */
  onInputTranscript: (text: string) => void;
  /** Output transcription of model speech */
  onOutputTranscript: (text: string) => void;
  /** Model turn was interrupted by user speech */
  onInterrupted: () => void;
  /** Session ended or error */
  onClose: (reason: string) => void;
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private callbacks: GeminiLiveCallbacks;
  private systemPrompt: string;
  private toolDeclarations: any[];
  private resumeHandle: string | null = null;
  private isSetupComplete = false;
  private pendingAudio: Buffer[] = [];
  private turnActive = false;
  private speakingUntil = 0;
  private onSetupComplete: (() => void) | null = null;

  /** True while Gemini is speaking (plus a short tail while audio drains). */
  get isSpeaking(): boolean {
    return this.turnActive || Date.now() < this.speakingUntil;
  }

  constructor(
    callbacks: GeminiLiveCallbacks,
    systemPrompt: string,
    toolDeclarations: any[]
  ) {
    this.callbacks = callbacks;
    this.systemPrompt = systemPrompt;
    this.toolDeclarations = toolDeclarations;
  }

  updateSystemPrompt(prompt: string) {
    this.systemPrompt = prompt;
  }

  /**
   * Open the WebSocket to Gemini (TCP + TLS handshake only).
   * Call sendSetupAndWait() after to send config and wait for setupComplete.
   */
  async openSocket(): Promise<void> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");

    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        log.info("connected to Gemini Live API");
        resolve();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch (err) {
          log.error({ err }, "failed to parse Gemini message");
        }
      });

      this.ws.on("close", (code, reason) => {
        log.info(
          { code, reason: reason.toString() },
          "Gemini connection closed"
        );
        this.callbacks.onClose(reason.toString() || `closed: ${code}`);
      });

      this.ws.on("error", (err) => {
        log.error({ err }, "Gemini WebSocket error");
        if (!this.isSetupComplete) {
          reject(err);
        }
        this.callbacks.onClose("connection_error");
      });
    });
  }

  /**
   * Send the setup config and wait for Gemini to confirm setupComplete.
   * Must be called after openSocket() resolves.
   */
  async sendSetupAndWait(): Promise<void> {
    return new Promise((resolve) => {
      this.onSetupComplete = resolve;
      this.sendSetup();
    });
  }

  /**
   * Convenience method: open socket + send setup in one call.
   */
  async connect(): Promise<void> {
    await this.openSocket();
    await this.sendSetupAndWait();
  }

  private sendSetup() {
    const setup: Record<string, any> = {
      setup: {
        model: `models/${GEMINI_LIVE_MODEL}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Charon",
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: this.systemPrompt }],
        },
        tools: [
          {
            functionDeclarations: this.toolDeclarations,
          },
        ],
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
            endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
            prefixPaddingMs: 200,
            silenceDurationMs: 1200,
          },
        },
        contextWindowCompression: {
          slidingWindow: {},
          triggerTokens: 100000,
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    };

    if (this.resumeHandle) {
      setup.setup.sessionResumption = { handle: this.resumeHandle };
    }

    this.send(setup);
  }

  private handleMessage(msg: any) {
    const keys = Object.keys(msg);
    log.debug({ keys }, "Gemini message received");

    if (msg.setupComplete) {
      log.info("Gemini setup complete");
      this.isSetupComplete = true;
      // Flush any audio that arrived before setup completed
      for (const buf of this.pendingAudio) {
        this.sendAudioChunk(buf);
      }
      this.pendingAudio = [];
      this.onSetupComplete?.();
      this.onSetupComplete = null;
      return;
    }

    if (msg.serverContent) {
      this.handleServerContent(msg.serverContent);
      return;
    }

    if (msg.toolCall) {
      this.handleToolCall(msg.toolCall);
      return;
    }

    if (msg.toolCallCancellation) {
      log.info(
        { ids: msg.toolCallCancellation.ids },
        "tool calls cancelled"
      );
      return;
    }

    if (msg.sessionResumptionUpdate) {
      this.resumeHandle = msg.sessionResumptionUpdate.newHandle || null;
      return;
    }

    if (msg.goAway) {
      log.warn({ timeLeft: msg.goAway.timeLeft }, "Gemini goAway received");
      return;
    }
  }

  private handleServerContent(content: any) {
    // Audio data from model
    if (content.modelTurn?.parts) {
      if (!this.turnActive) {
        this.turnActive = true;
        this.callbacks.onTurnStart();
      }
      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data) {
          const pcmBuffer = Buffer.from(part.inlineData.data, "base64");
          this.callbacks.onAudio(pcmBuffer);
        }
      }
    }

    // Transcriptions
    if (content.inputTranscription?.text) {
      this.callbacks.onInputTranscript(content.inputTranscription.text);
    }
    if (content.outputTranscription?.text) {
      this.callbacks.onOutputTranscript(content.outputTranscription.text);
    }

    // Turn complete
    if (content.turnComplete) {
      this.turnActive = false;
      // Tail window so buffered audio playing through speakers doesn't echo back in
      this.speakingUntil = Date.now() + 800;
      this.callbacks.onTurnEnd();
    }

    // Interruption
    if (content.interrupted) {
      log.debug("model turn interrupted by user");
      this.turnActive = false;
      this.speakingUntil = 0;
      this.callbacks.onInterrupted();
    }
  }

  private async handleToolCall(toolCall: any) {
    if (!toolCall.functionCalls) return;

    for (const call of toolCall.functionCalls) {
      log.info({ id: call.id, name: call.name }, "tool call received");

      try {
        const result = await this.callbacks.onToolCall(
          call.id,
          call.name,
          call.args || {}
        );

        this.send({
          toolResponse: {
            functionResponses: [
              {
                id: call.id,
                name: call.name,
                response: result,
              },
            ],
          },
        });
      } catch (err) {
        log.error({ err, callId: call.id }, "tool call execution failed");
        this.send({
          toolResponse: {
            functionResponses: [
              {
                id: call.id,
                name: call.name,
                response: { error: "Tool execution failed" },
              },
            ],
          },
        });
      }
    }
  }

  /**
   * Send a PCM 16-bit 16kHz audio chunk from the browser to Gemini.
   * The raw binary is base64-encoded and wrapped in a realtimeInput message.
   */
  /**
   * Send a text message via realtimeInput to prompt Gemini to respond.
   * Used to make Gemini speak first at session start.
   */
  sendClientText(text: string) {
    this.send({
      realtimeInput: {
        text,
      },
    });
  }

  sendAudioChunk(pcmBuffer: Buffer) {
    if (!this.isSetupComplete) {
      this.pendingAudio.push(pcmBuffer);
      return;
    }

    this.send({
      realtimeInput: {
        audio: {
          data: pcmBuffer.toString("base64"),
          mimeType: "audio/pcm;rate=16000",
        },
      },
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000, "session_end");
      this.ws = null;
    }
    this.isSetupComplete = false;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.isSetupComplete;
  }

  private send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}
