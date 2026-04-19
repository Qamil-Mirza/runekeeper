#!/bin/bash
# Generates fake double-clap PCM16 audio and sends it to the OMI webhook.
# Usage: bash scripts/test-clap.sh [base_url]

BASE_URL="${1:-http://localhost:3000}"
TOKEN="575a30f3b14ddd3faa5998bb10f4a6a9b5329a9a660f33628b001271dab77904"
OMI_UID="GPE9nmhrKXamHuadaS9Z7RE1IEs1"
SAMPLE_RATE=16000
ENDPOINT="${BASE_URL}/api/integrations/omi/webhook?token=${TOKEN}&uid=${OMI_UID}&sample_rate=${SAMPLE_RATE}"

echo "==> Generating double-clap PCM16 audio..."

python3 -c "
import struct, sys

sr = 16000
silence = b'\x00\x00' * int(sr * 0.1)      # 100ms silence
clap = struct.pack('<' + 'h' * 40, *([20000] * 20 + [-20000] * 20))  # ~2.5ms spike
gap = b'\x00\x00' * int(sr * 0.3)           # 300ms gap between claps

# Layout: silence + clap + gap + clap + silence
pcm = silence + clap + gap + clap + silence
sys.stdout.buffer.write(pcm)
" > /tmp/double_clap.pcm

SIZE=$(wc -c < /tmp/double_clap.pcm | tr -d ' ')
echo "==> Generated ${SIZE} bytes of PCM audio"
echo "==> Sending to ${ENDPOINT}"
echo ""

curl -v \
  -X POST \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/double_clap.pcm \
  "${ENDPOINT}"

echo ""
echo ""
echo "==> Done. Check server logs for 'double-clap detected' message."
