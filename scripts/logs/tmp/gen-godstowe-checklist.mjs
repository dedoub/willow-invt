import XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

const outDir = '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/tmp';

// ===== EXCEL =====
const wb = XLSX.utils.book_new();

const checklistData = [
  ['', '류하 갓스토우 교환학생 체크리스트', '', ''],
  ['', '프로그램: 2026.04.24(금) ~ 05.21(목), 약 4주', '', ''],
  ['', '학교: Godstowe School, 영국 버킹엄셔', '', ''],
  ['', '비용: £8,500 (약 1,650만원)', '', ''],
  [],
  ['구분', '항목', '완료', '비고'],

  ['지금 바로 (이번 주)', '여권 유효기간 확인 (10/24 이후까지)', '', '6개월+ 필수'],
  ['', '항공권 예약 (4/24 도착, 5/21 출발)', '', 'e티켓 GLC에 전달'],
  ['', '여행자 보험 가입', '', '4주 해외체류 커버'],
  ['', '참가비 £8,500 송금', '', '약 1,650만원, GLC에 송금방법 확인'],
  ['', '로밍 신청 or 영국 유심 준비', '', '인천공항 로밍 추천'],

  ['출발 2~3주 전', '입국서류 확인', '', '스쿨레터+여행허가서+가디언레터 (GLC 제공)'],
  ['', '용돈 준비 — 현금 £200 + 해외결제 카드', '', ''],
  ['', '복용 약 있으면 영문 진단서 준비', '', '영문표기 필수, 학교 간호사 제출'],

  ['준비물 — 신발', '검정 학교 신발 (구두형)', '', '운동화 안됨'],
  ['', '흰색 실내 운동화', '', ''],
  ['', '실외 운동화', '', ''],
  ['', '실내 슬리퍼', '', ''],

  ['준비물 — 의류', '맨투맨 (빨강 또는 검정)', '', ''],
  ['', '검정 하의 체육복 or 레깅스', '', ''],
  ['', '수영복 + 수경', '', ''],
  ['', '드레싱 가운', '', ''],
  ['', '경복 학교 자켓', '', '학교 행사 시 착용'],
  ['', '방수 잠바', '', ''],

  ['준비물 — 생활용품', '세탁망 2개 (컬러, 흰색 분리)', '', ''],
  ['', '목욕수건 3개', '', ''],
  ['', '샴푸, 린스, 칫솔, 치약, 로션, 머리빗', '', ''],
  ['', '선크림', '', '영국 4~5월 햇빛 강함'],
  ['', '영국 변환 플러그', '', ''],
  ['', '물통', '', ''],

  ['준비물 — 학용품/가방', '학교용 배낭 + 미니백/크로스백', '', ''],
  ['', '필기도구 세트', '', '연필,지우개,자,각도기,컬러펜슬,계산기,가위,풀,컴파스,하이라이터'],
  ['', '손목시계 (스마트워치 제외)', '', ''],

  ['준비물 — 캐리어', '수화물 1개 + 기내용 1개 + 백팩 1개', '', ''],

  ['잊기 쉬운 것', '모든 옷·소지품에 이름표 부착', '', '공동 세탁 필수'],
  ['', '세탁하기 편한 옷 위주로 팩킹', '', '기숙사 공동 세탁'],
  ['', '귀중품 최소화', '', '카메라 등은 사감에게 맡김'],
];

const ws = XLSX.utils.aoa_to_sheet(checklistData);

// Column widths
ws['!cols'] = [
  { wch: 20 },  // 구분
  { wch: 45 },  // 항목
  { wch: 8 },   // 완료
  { wch: 40 },  // 비고
];

// Merge header cells
ws['!merges'] = [
  { s: { r: 0, c: 1 }, e: { r: 0, c: 3 } },
  { s: { r: 1, c: 1 }, e: { r: 1, c: 3 } },
  { s: { r: 2, c: 1 }, e: { r: 2, c: 3 } },
  { s: { r: 3, c: 1 }, e: { r: 3, c: 3 } },
];

XLSX.utils.book_append_sheet(wb, ws, '체크리스트');
const xlsxPath = path.join(outDir, '류하_갓스토우_체크리스트.xlsx');
XLSX.writeFile(wb, xlsxPath);
console.log('Excel saved:', xlsxPath);

// ===== PDF =====
const fontPath = '/System/Library/Fonts/Supplemental/AppleGothic.ttf';
let fontData;
try {
  fontData = fs.readFileSync(fontPath);
} catch (e) {
  console.log('Korean font not found:', e.message);
}

const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

if (fontData) {
  const fontBase64 = fontData.toString('base64');
  doc.addFileToVFS('AppleGothic.ttf', fontBase64);
  doc.addFont('AppleGothic.ttf', 'AppleGothic', 'normal');
  doc.setFont('AppleGothic');
} else {
  console.log('Warning: Korean font not available, PDF may not render Korean text properly');
}

const pageW = 210;
const margin = 15;
const contentW = pageW - margin * 2;
let y = 20;

function addText(text, size, opts = {}) {
  doc.setFontSize(size);
  if (opts.bold) {
    doc.setFont('AppleGothic', 'normal');
  }
  if (opts.color) doc.setTextColor(...opts.color);
  else doc.setTextColor(30, 30, 30);

  const lines = doc.splitTextToSize(text, contentW - (opts.indent || 0));
  for (const line of lines) {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, margin + (opts.indent || 0), y);
    y += size * 0.45;
  }
}

function addLine() {
  if (y > 275) { doc.addPage(); y = 20; }
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y, pageW - margin, y);
  y += 4;
}

// Title
addText('류하 갓스토우 교환학생 체크리스트', 18);
y += 2;
addText('프로그램: 2026.04.24(금) ~ 05.21(목), 약 4주', 10, { color: [100, 100, 100] });
addText('학교: Godstowe School, 영국 버킹엄셔', 10, { color: [100, 100, 100] });
addText('비용: £8,500 (약 1,650만원)', 10, { color: [100, 100, 100] });
y += 6;
addLine();

const sections = [
  {
    title: '지금 바로 (이번 주)',
    items: [
      '☐ 여권 유효기간 확인 — 10월 24일 이후까지 남아있어야 함 (6개월+)',
      '☐ 항공권 예약 — 4/24 도착, 5/21 출발. e티켓 GLC에 전달 필요',
      '☐ 여행자 보험 가입 — 4주 해외체류 커버되는 거로',
      '☐ 참가비 £8,500 송금 (약 1,650만원) — 송금 일정/방법 GLC에 확인',
      '☐ 로밍 신청 or 영국 유심 준비 — 인천공항 로밍 추천',
    ]
  },
  {
    title: '출발 2~3주 전',
    items: [
      '☐ 입국서류 확인 — 스쿨 레터 + 여행 허가서 + 가디언 레터 (GLC 제공)',
      '☐ 용돈 준비 — 현금 £200 + 부모님 신용카드 (해외결제 가능한 거)',
      '☐ 복용 약 있으면 영문 진단서 준비 — 모든 약은 영문 표기 필수',
    ]
  },
  {
    title: '준비물 — 신발',
    items: [
      '☐ 검정 학교 신발 (구두형, 운동화 안됨)',
      '☐ 흰색 실내 운동화 + 실외 운동화 (2켤레)',
      '☐ 실내 슬리퍼',
    ]
  },
  {
    title: '준비물 — 의류',
    items: [
      '☐ 맨투맨 — 빨강 또는 검정',
      '☐ 검정 하의 체육복 or 레깅스',
      '☐ 수영복 + 수경',
      '☐ 드레싱 가운',
      '☐ 경복 학교 자켓 — 학교 행사 때 입음',
      '☐ 방수 잠바',
    ]
  },
  {
    title: '준비물 — 생활용품',
    items: [
      '☐ 세탁망 2개 (컬러, 흰색 분리용)',
      '☐ 목욕수건 3개, 샴푸, 린스, 칫솔, 치약, 로션, 머리빗',
      '☐ 선크림 (영국 4~5월 햇빛 강함)',
      '☐ 영국 변환 플러그',
      '☐ 물통',
    ]
  },
  {
    title: '준비물 — 학용품/가방',
    items: [
      '☐ 학교용 배낭 + 미니백/크로스백',
      '☐ 필기도구 세트 (연필, 지우개, 30cm자, 각도기, 컬러펜슬, 계산기, 가위, 풀, 컴파스, 하이라이터)',
      '☐ 손목시계 (스마트워치 제외)',
    ]
  },
  {
    title: '준비물 — 캐리어',
    items: [
      '☐ 수화물 1개 + 기내용 1개 + 백팩 1개',
    ]
  },
  {
    title: '잊기 쉬운 것',
    items: [
      '☐ 모든 옷·소지품에 이름표 부착 — 공동 세탁이라 필수',
      '☐ 세탁하기 편한 옷 위주로 팩킹 (기숙사 공동 세탁)',
      '☐ 귀중품은 최소화 (카메라 등은 사감에게 맡김)',
    ]
  },
];

for (const section of sections) {
  addText(section.title, 12);
  y += 1;
  for (const item of section.items) {
    addText(item, 9, { indent: 4 });
  }
  y += 4;
}

const pdfPath = path.join(outDir, '류하_갓스토우_체크리스트.pdf');
doc.save(pdfPath);
console.log('PDF saved:', pdfPath);
