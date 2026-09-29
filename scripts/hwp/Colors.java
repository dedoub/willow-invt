import kr.dogfoot.hwplib.reader.HWPReader;
import kr.dogfoot.hwplib.object.HWPFile;
import kr.dogfoot.hwplib.object.bodytext.paragraph.Paragraph;
import kr.dogfoot.hwplib.object.bodytext.paragraph.charshape.*;
import kr.dogfoot.hwplib.object.bodytext.control.*;
import kr.dogfoot.hwplib.object.bodytext.control.table.*;
public class Colors { public static void main(String[] a) throws Exception {
  HWPFile f=HWPReader.fromFile(a[0]);
  for (Paragraph tp: f.getBodyText().getSectionList().get(0).getParagraphs()) { if (tp.getControlList()==null) continue;
   for (Control c: tp.getControlList()) { if (c.getType()!=ControlType.Table) continue;
    for (Row r: ((ControlTable)c).getRowList()) for (Cell cell: r.getCellList()) for (Paragraph p: cell.getParagraphList()) {
      if (p.getText()==null || p.getCharShape()==null) continue;
      String t=p.getText().getNormalString(0).trim(); if (t.isEmpty()) continue;
      StringBuilder sb=new StringBuilder();
      for (CharPositionShapeIdPair q: p.getCharShape().getPositonShapeIdPairList()) { var col=f.getDocInfo().getCharShapeList().get((int)q.getShapeId()).getCharColor(); sb.append(q.getPosition()+":#"+String.format("%02x%02x%02x",col.getR(),col.getG(),col.getB())+" "); }
      if (!sb.toString().matches("(\\d+:#000000 )+")) System.out.println("NOT BLACK: "+t+" -> "+sb);
    }}}
  System.out.println("checked");
}}
