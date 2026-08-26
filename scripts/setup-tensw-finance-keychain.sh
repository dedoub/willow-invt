#!/bin/bash
set -euo pipefail

echo "홈택스 텐소프트웍스 공동인증서 비밀번호를 Keychain에 저장해요."
echo "비밀번호는 화면과 쉘 기록에 표시되지 않아요."
/usr/bin/security add-generic-password \
  -U \
  -a tensoftworks \
  -s willow.tensw.hometax.certificate \
  -l "Tensoftworks HomeTax Certificate" \
  -w

echo "Keychain 저장을 완료했어요."
