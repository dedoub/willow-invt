import kr.dogfoot.hwplib.reader.HWPReader;
import kr.dogfoot.hwplib.object.HWPFile;
import kr.dogfoot.hwplib.object.bodytext.Section;
import kr.dogfoot.hwplib.object.bodytext.paragraph.Paragraph;
import kr.dogfoot.hwplib.object.bodytext.control.*;
import kr.dogfoot.hwplib.object.bodytext.control.table.*;
public class Dump {
  static String txt(Paragraph p) { try { return p.getText()==null? "" : p.getText().getNormalString(0); } catch(Exception e){ return "?"; } }
  public static void main(String[] a) throws Exception {
    HWPFile f = HWPReader.fromFile(a[0]);
    int si=0;
    for (Section s : f.getBodyText().getSectionList()) {
      Paragraph[] ps = s.getParagraphs();
      for (int i=0;i<ps.length;i++) {
        Paragraph p=ps[i];
        System.out.println("S"+si+" P"+i+" ["+txt(p).trim()+"] ctrls="+(p.getControlList()==null?0:p.getControlList().size()));
        if (p.getControlList()==null) continue;
        int ti=0;
        for (Control c : p.getControlList()) {
          if (c.getType()!=ControlType.Table) continue;
          ControlTable t=(ControlTable)c;
          for (Row r : t.getRowList()) for (Cell cell : r.getCellList()) {
            ListHeaderForCell h=cell.getListHeader();
            StringBuilder sb=new StringBuilder();
            for (Paragraph cp : cell.getParagraphList()) sb.append(txt(cp)).append(" / ");
            System.out.println("   T"+ti+" r"+h.getRowIndex()+" c"+h.getColIndex()+" span"+h.getRowSpan()+"x"+h.getColSpan()+" npara="+cell.getParagraphList().getParagraphCount()+" :: "+sb);
          }
          ti++;
        }
      }
      si++;
    }
  }
}
