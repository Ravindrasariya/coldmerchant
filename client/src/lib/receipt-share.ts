import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export async function shareReceiptAsPdf(
  contentElement: HTMLElement,
  filename: string
): Promise<void> {
  const canvas = await html2canvas(contentElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const imgWidth = 210;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const pdf = new jsPDF("p", "mm", "a4");
  const pageHeight = pdf.internal.pageSize.getHeight();

  if (imgHeight <= pageHeight) {
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgWidth, imgHeight);
  } else {
    let yOffset = 0;
    let page = 0;
    while (yOffset < imgHeight) {
      if (page > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, -yOffset, imgWidth, imgHeight);
      yOffset += pageHeight;
      page++;
    }
  }

  const pdfBlob = pdf.output("blob");
  const pdfFile = new File([pdfBlob], `${filename}.pdf`, { type: "application/pdf" });

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile && navigator.share && navigator.canShare?.({ files: [pdfFile] })) {
    await navigator.share({
      files: [pdfFile],
      title: filename,
    });
  } else {
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
