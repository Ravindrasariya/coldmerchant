import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const PDF_CAPTURE_WIDTH = 800;

export async function shareReceiptAsPdf(
  contentElement: HTMLElement,
  filename: string
): Promise<void> {
  const scrollContainer = contentElement.closest("[class*='overflow']") as HTMLElement | null;
  const dialog = contentElement.closest("[role='dialog']") as HTMLElement | null;

  const origStyles = {
    elWidth: contentElement.style.width,
    elMinWidth: contentElement.style.minWidth,
    elMaxWidth: contentElement.style.maxWidth,
    scrollOverflow: scrollContainer?.style.overflow || "",
    scrollMaxHeight: scrollContainer?.style.maxHeight || "",
    dialogWidth: dialog?.style.width || "",
    dialogMinWidth: dialog?.style.minWidth || "",
    dialogMaxWidth: dialog?.style.maxWidth || "",
    dialogOverflow: dialog?.style.overflow || "",
    dialogPosition: dialog?.style.position || "",
    dialogLeft: dialog?.style.left || "",
  };

  contentElement.style.width = `${PDF_CAPTURE_WIDTH}px`;
  contentElement.style.minWidth = `${PDF_CAPTURE_WIDTH}px`;
  contentElement.style.maxWidth = `${PDF_CAPTURE_WIDTH}px`;

  if (scrollContainer) {
    scrollContainer.style.overflow = "visible";
    scrollContainer.style.maxHeight = "none";
  }

  if (dialog) {
    dialog.style.width = `${PDF_CAPTURE_WIDTH + 64}px`;
    dialog.style.minWidth = `${PDF_CAPTURE_WIDTH + 64}px`;
    dialog.style.maxWidth = `${PDF_CAPTURE_WIDTH + 64}px`;
    dialog.style.overflow = "visible";
    dialog.style.position = "fixed";
    dialog.style.left = "-9999px";
  }

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  try {
    const contentRect = contentElement.getBoundingClientRect();
    console.log("PDF capture: element rect", { w: contentRect.width, h: contentRect.height, top: contentRect.top, left: contentRect.left });

    const canvas = await html2canvas(contentElement, {
      scale: isMobileDevice ? 1.5 : 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: PDF_CAPTURE_WIDTH,
      height: contentRect.height > 0 ? Math.ceil(contentRect.height) : undefined,
      windowWidth: PDF_CAPTURE_WIDTH + 64,
      scrollX: 0,
      scrollY: 0,
    });

    console.log("PDF capture: canvas size", { w: canvas.width, h: canvas.height });

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

    const downloadFallback = () => {
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    if (isMobileDevice && navigator.share && navigator.canShare?.({ files: [pdfFile] })) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: filename,
        });
      } catch (shareErr: any) {
        if (shareErr?.name !== "AbortError") {
          downloadFallback();
        }
      }
    } else {
      downloadFallback();
    }
  } finally {
    contentElement.style.width = origStyles.elWidth;
    contentElement.style.minWidth = origStyles.elMinWidth;
    contentElement.style.maxWidth = origStyles.elMaxWidth;

    if (scrollContainer) {
      scrollContainer.style.overflow = origStyles.scrollOverflow;
      scrollContainer.style.maxHeight = origStyles.scrollMaxHeight;
    }

    if (dialog) {
      dialog.style.width = origStyles.dialogWidth;
      dialog.style.minWidth = origStyles.dialogMinWidth;
      dialog.style.maxWidth = origStyles.dialogMaxWidth;
      dialog.style.overflow = origStyles.dialogOverflow;
      dialog.style.position = origStyles.dialogPosition;
      dialog.style.left = origStyles.dialogLeft;
    }
  }
}
