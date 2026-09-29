import kr.dogfoot.hwplib.reader.HWPReader;
import kr.dogfoot.hwplib.writer.HWPWriter;
import kr.dogfoot.hwplib.object.HWPFile;
import kr.dogfoot.hwplib.object.bodytext.Section;
import kr.dogfoot.hwplib.object.bodytext.paragraph.Paragraph;
import kr.dogfoot.hwplib.object.bodytext.paragraph.text.*;
import kr.dogfoot.hwplib.object.bodytext.paragraph.charshape.*;
import kr.dogfoot.hwplib.object.bodytext.control.*;
import kr.dogfoot.hwplib.object.bodytext.control.table.*;
import java.util.*;

/** 강남구 서식 13(정규직 전환 지원금 신청서)을 채운다. 인자: 원본 양식 hwp, 출력 hwp, 값 파일(key<TAB>value). */
public class Fill {
  static HWPFile F;
  // 가장 진한 글자색의 글자모양 — 양식의 회색 예시 글자 모양을 빼고 고른다.
  static long darkest(java.util.List<CharPositionShapeIdPair> pairs) {
    long best = pairs.get(0).getShapeId(); int bestSum = Integer.MAX_VALUE;
    for (CharPositionShapeIdPair q : pairs) {
      kr.dogfoot.hwplib.object.etc.Color4Byte c = F.getDocInfo().getCharShapeList().get((int) q.getShapeId()).getCharColor();
      int sum = c.getR() + c.getG() + c.getB();
      if (sum < bestSum) { bestSum = sum; best = q.getShapeId(); }
    }
    return best;
  }
  // 문단의 보통 글자만 s 로 바꾼다. 컨트롤 글자(구역·표)는 그대로 두고, 글자 수·글자모양 위치를 맞춘 뒤
  // 줄 배치 정보를 지운다(한컴이 열 때 다시 배치한다).
  static void setText(Paragraph p, String s) throws Exception {
    if (p.getText() == null) p.createText();
    ParaText t = p.getText();
    ArrayList<HWPChar> list = t.getCharList();
    list.removeIf(c -> c.getType() == HWPCharType.Normal);
    int at = list.size();
    for (int i = 0; i < list.size(); i++) if (list.get(i).getType() == HWPCharType.ControlChar && list.get(i).getCode() == 13) { at = i; break; }
    boolean hasEnd = at < list.size();
    if (!s.isEmpty()) t.insertString(at, s);
    if (!hasEnd) { HWPCharControlChar e = t.addNewCharControlChar(); e.setCode((short) 13); }
    int size = t.getCharSize();
    p.getHeader().setCharacterCount(size);
    if (p.getCharShape() != null) {
      // 채운 글자는 한 가지 모양으로 — 양식의 예시 글자(회색)가 위치별로 남아 새 글자 일부가 회색이 됐다.
      ArrayList<CharPositionShapeIdPair> pairs = p.getCharShape().getPositonShapeIdPairList();
      if (!pairs.isEmpty() && !s.isEmpty()) {
        long id = darkest(pairs);
        pairs.clear();
        CharPositionShapeIdPair one = new CharPositionShapeIdPair(); one.setPosition(0); one.setShapeId(id); pairs.add(one);
      }
      p.getHeader().setCharShapeCount(pairs.size());
    }
    // 줄 배치 정보는 지우지 않는다(지우고 문단까지 지우면 파일이 깨졌다). 첫 줄 하나만 남기고 시작 위치를 0 으로 —
    // 글자가 바뀌어 옛 줄 나눔 위치가 틀리므로, 한컴이 열 때 다시 나눈다.
    if (p.getLineSeg() != null && !p.getLineSeg().getLineSegItemList().isEmpty()) {
      java.util.ArrayList<kr.dogfoot.hwplib.object.bodytext.paragraph.lineseg.LineSegItem> items = p.getLineSeg().getLineSegItemList();
      while (items.size() > 1) items.remove(items.size() - 1);
      items.get(0).setTextStartPosition(0);
      p.getHeader().setLineAlignCount(1);
    }
  }

  public static void main(String[] a) throws Exception {
    HWPFile f = HWPReader.fromFile(a[0]); F = f;
    Map<String, String> v = new LinkedHashMap<>();
    for (String line : java.nio.file.Files.readAllLines(java.nio.file.Paths.get(a[2]), java.nio.charset.StandardCharsets.UTF_8)) {
      if (line.isBlank() || line.startsWith("#")) continue;
      String[] kv = line.split("\t", 2); v.put(kv[0], kv.length > 1 ? kv[1] : "");
    }
    Section sec = f.getBodyText().getSectionList().get(0);
    // 서식 13 표는 "【서식 13】" 문단 바로 다음 문단에 있다.
    int head = -1;
    for (int i = 0; i < sec.getParagraphCount(); i++) {
      ParaText t = sec.getParagraph(i).getText();
      if (t != null && t.getNormalString(0).contains(System.getProperty("form", "서식 13"))) { head = i; break; }
    }
    if (head < 0) throw new IllegalStateException("서식 13 을 못 찾음");
    ControlTable table = null;
    for (Control c : sec.getParagraph(head + 1).getControlList()) if (c.getType() == ControlType.Table) table = (ControlTable) c;
    Map<String, Cell> cells = new HashMap<>();
    for (Row r : table.getRowList()) for (Cell c : r.getCellList())
      cells.put("r" + c.getListHeader().getRowIndex() + "c" + c.getListHeader().getColIndex(), c);
    int n = 0;
    for (Map.Entry<String, String> e : v.entrySet()) {       // 키: r10c2p1 = 행 10, 열 2, 칸 안 둘째 문단
      String k = e.getKey();
      int pi = k.indexOf('p');
      Cell c = cells.get(k.substring(0, pi));
      if (c == null) throw new IllegalStateException("칸 없음: " + k);
      int para = Integer.parseInt(k.substring(pi + 1));
      // 칸에 문단이 모자라면 마지막 문단을 복제해 늘린다(두 줄로 적을 칸: 소재지 등)
      while (para >= c.getParagraphList().getParagraphCount()) {
        int last = c.getParagraphList().getParagraphCount() - 1;
        Paragraph copy = c.getParagraphList().getParagraph(last).clone();
        c.getParagraphList().getParagraph(last).getHeader().setLastInList(false);
        c.getParagraphList().insertParagraph(last + 1, copy);
      }
      setText(c.getParagraphList().getParagraph(para), e.getValue()); n++;
    }
    if (Boolean.getBoolean("keepOthers")) { HWPWriter.toFile(f, a[1]); System.out.println("(다른 서식 유지) 채운 칸 " + n); return; }
    // 정렬·줄 간격 통일: 입력 값은 가운데, 금액은 오른쪽. 둘 다 줄 간격 100% 인 양식의 문단 모양을 쓰고,
    // 두 줄 칸의 줄 위치를 그 간격으로 다시 적는다(칸마다 간격이 달라 보였다).
    int center = Integer.parseInt(System.getProperty("psCenter", "3")), rightPs = Integer.parseInt(System.getProperty("psRight", "22"));
    Set<String> money = new HashSet<>(Arrays.asList(System.getProperty("money", "").split(",")));
    Set<String> skip = new HashSet<>(Arrays.asList(System.getProperty("skipAlign", "").split(",")));  // 제목·서명 칸은 양식 배치 그대로
    Set<String> done = new HashSet<>();
    boolean noAlign = Boolean.getBoolean("noAlign");   // 양식 정렬을 그대로 둘 때(출근부: 날짜를 빈칸으로 맞춘다)
    for (String k : noAlign ? java.util.Collections.<String>emptySet() : v.keySet()) {
      String ck = k.substring(0, k.indexOf('p'));
      if (!done.add(ck) || skip.contains(ck)) continue;
      Cell c = cells.get(ck);
      int y = 0;
      for (int i = 0; i < c.getParagraphList().getParagraphCount(); i++) {
        Paragraph p = c.getParagraphList().getParagraph(i);
        p.getHeader().setParaShapeId(money.contains(ck) ? rightPs : center);
        if (p.getLineSeg() == null || p.getLineSeg().getLineSegItemList().isEmpty()) continue;
        kr.dogfoot.hwplib.object.bodytext.paragraph.lineseg.LineSegItem it = p.getLineSeg().getLineSegItemList().get(0);
        it.setLineVerticalPosition(y);
        it.setLineSpace(0);
        y += it.getLineHeight();
      }
    }
    // 서명 줄("회사 대표 김 철 형")은 오른쪽 정렬이라 이름이 칸 끝에 붙어 인감 자리가 없다(뒤 빈칸은 정렬에서 무시된다).
    // 그 문단 모양을 복제해 오른쪽 여백만 늘린 새 모양을 이 문단에만 준다 — 8월 제출본의 이름 위치에 맞춘다.
    int signMargin = Integer.parseInt(System.getProperty("signRightMargin", "0"));
    if (signMargin > 0) {
      Cell sc = cells.get(System.getProperty("signCell", "r18c0"));
      Paragraph sp = sc.getParagraphList().getParagraph(Integer.parseInt(System.getProperty("signPara", "3")));
      kr.dogfoot.hwplib.object.docinfo.ParaShape ps = f.getDocInfo().getParaShapeList().get(sp.getHeader().getParaShapeId()).clone();
      ps.setRightMargin(ps.getRightMargin() + signMargin);
      f.getDocInfo().getParaShapeList().add(ps);
      int id = f.getDocInfo().getParaShapeList().size() - 1;
      f.getDocInfo().getIDMappings().setParaShapeCount(f.getDocInfo().getParaShapeList().size());
      sp.getHeader().setParaShapeId(id);
    }
    // 서식 9·12 를 지운다. 첫 문단은 구역 정의를 들고 있어 지우지 않고 제목 글자만 바꾼다.
    setText(sec.getParagraph(0), sec.getParagraph(head).getText().getNormalString(0));
    // 제목 문단의 모양(오른쪽 정렬)과 글자 모양도 서식 13 제목 것으로 — 첫 문단은 서식 9 제목 모양이었다.
    Paragraph h13 = sec.getParagraph(head);
    // 양식의 제목은 왼쪽 정렬이지만 8월 제출본은 오른쪽이었다 — 8월에 맞춘다(오른쪽 정렬 문단 모양).
    sec.getParagraph(0).getHeader().setParaShapeId(Integer.parseInt(System.getProperty("psHeading", String.valueOf(h13.getHeader().getParaShapeId()))));
    sec.getParagraph(0).getHeader().setStyleId(h13.getHeader().getStyleId());
    if (h13.getCharShape() != null && sec.getParagraph(0).getCharShape() != null) {
      java.util.ArrayList<CharPositionShapeIdPair> pairs = sec.getParagraph(0).getCharShape().getPositonShapeIdPairList();
      pairs.clear();
      for (CharPositionShapeIdPair q : h13.getCharShape().getPositonShapeIdPairList()) pairs.add(new CharPositionShapeIdPair(0, q.getShapeId()));
      while (pairs.size() > 1) pairs.remove(pairs.size() - 1);
      sec.getParagraph(0).getHeader().setCharShapeCount(1);
    }
    Paragraph first = sec.getParagraph(0);
    // 첫 문단에 붙어 있던 서식 9 의 개체(표 등)는 뗀다 — 구역·단 정의만 남긴다.
    first.getControlList().removeIf(c -> c.getType() != ControlType.SectionDefine && c.getType() != ControlType.ColumnDefine);
    // 뒤쪽 서식(다음 "【서식" 제목부터 끝까지)을 지운다. 지운 뒤 새 마지막 문단에 "구역 마지막" 표시를 다시 단다 —
    // 빠지면 한글이 "파일이 손상되었습니다"로 거부한다(출근부 스킬의 덫).
    int end = sec.getParagraphCount();
    for (int i = head + 1; i < sec.getParagraphCount(); i++) {
      ParaText t = sec.getParagraph(i).getText();
      if (t != null && t.getNormalString(0).contains("【서식")) { end = i; break; }
    }
    for (int i = sec.getParagraphCount() - 1; i >= end; i--) sec.deleteParagraph(i);
    for (int i = head; i >= 1; i--) sec.deleteParagraph(i);
    for (int i = 0; i < sec.getParagraphCount(); i++) sec.getParagraph(i).getHeader().setLastInList(i == sec.getParagraphCount() - 1);
    HWPWriter.toFile(f, a[1]);
    System.out.println("채운 칸 " + n + "개, 저장: " + a[1]);
  }
}
