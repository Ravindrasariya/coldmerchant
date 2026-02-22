const HTML2CANVAS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const JSPDF_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

const RECEIPT_BASE_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    padding: 20px;
    max-width: 800px;
    margin: 0 auto;
    background: #ffffff;
    color: #000000;
  }
  .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
  .header h1 { margin: 0; font-size: 24px; }
  .header p { margin: 5px 0; color: #555; }
  .receipt-title { text-align: center; font-size: 18px; font-weight: 600; margin: 10px 0; }
  .receipt-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
  .receipt-info p { margin: 2px 0; }
  .receipt-info .right, .receipt-info div:last-child { text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; font-size: 13px; }
  th { background-color: #f0f0f0; font-weight: 600; }
  tfoot td { background-color: #f9f9f9; font-weight: 600; }
  .text-right, td.text-right, th.text-right { text-align: right; }
  .text-center, td.text-center, th.text-center { text-align: center; }
  .text-left { text-align: left; }
  .font-bold, .font-semibold { font-weight: 600; }
  .font-medium { font-weight: 500; }
  .totals-section { border: 1px solid #000; padding: 10px 12px; margin-top: 15px; }
  .totals-section h3 { font-size: 14px; margin: 0 0 6px 0; padding-bottom: 4px; border-bottom: 1px solid #ccc; text-align: center; }
  .totals-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
  .totals-row.highlight { background-color: #f5f5f5; font-weight: bold; padding: 5px 8px; margin: 4px -12px; }
  .totals-row.final { background-color: #e8f5e9; font-weight: bold; font-size: 14px; padding: 6px 8px; margin: 6px -12px -10px -12px; border-top: 1px solid #000; }
  .profit { color: #2e7d32; }
  .loss { color: #c62828; }
  .disclaimer { margin-top: 20px; padding: 8px; border: 1px dashed #999; text-align: center; font-size: 11px; color: #666; }
  .disclaimer p { margin: 2px 0; }
  .thank-you { text-align: center; font-size: 12px; color: #666; margin: 10px 0; }
  .hindi { font-size: 0.9em; color: #666; }
  .bilingual { display: block; }
  .flex { display: flex; }
  .inline-flex { display: inline-flex; }
  .grid { display: grid; }
  .block { display: block; }
  .inline { display: inline; }
  .inline-block { display: inline-block; }
  .justify-between { justify-content: space-between; }
  .justify-end { justify-content: flex-end; }
  .items-center { align-items: center; }
  .items-start { align-items: flex-start; }
  .flex-1 { flex: 1 1 0%; }
  .flex-wrap { flex-wrap: wrap; }
  .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
  .grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
  .col-span-2 { grid-column: span 2; }
  .gap-1 { gap: 4px; }
  .gap-2 { gap: 8px; }
  .gap-3 { gap: 12px; }
  .gap-4 { gap: 16px; }
  .space-y-0\\.5 > * + * { margin-top: 2px; }
  .space-y-1 > * + * { margin-top: 4px; }
  .space-y-1\\.5 > * + * { margin-top: 6px; }
  .space-y-2 > * + * { margin-top: 8px; }
  .space-y-3 > * + * { margin-top: 12px; }
  .space-y-4 > * + * { margin-top: 16px; }
  .space-y-6 > * + * { margin-top: 24px; }
  .w-full { width: 100%; }
  .w-4 { width: 16px; }
  .h-4 { height: 16px; }
  .min-w-\\[600px\\] { min-width: 600px; }
  .min-w-\\[650px\\] { min-width: 650px; }
  .min-w-\\[700px\\] { min-width: 700px; }
  .p-1 { padding: 4px; }
  .p-2 { padding: 8px; }
  .p-2\\.5 { padding: 10px; }
  .p-3 { padding: 12px; }
  .p-4 { padding: 16px; }
  .px-1 { padding-left: 4px; padding-right: 4px; }
  .px-2 { padding-left: 8px; padding-right: 8px; }
  .px-4 { padding-left: 16px; padding-right: 16px; }
  .py-0\\.5 { padding-top: 2px; padding-bottom: 2px; }
  .py-1 { padding-top: 4px; padding-bottom: 4px; }
  .py-1\\.5 { padding-top: 6px; padding-bottom: 6px; }
  .py-2 { padding-top: 8px; padding-bottom: 8px; }
  .py-8 { padding-top: 32px; padding-bottom: 32px; }
  .pt-1 { padding-top: 4px; }
  .pt-2 { padding-top: 8px; }
  .pt-4 { padding-top: 16px; }
  .pb-1 { padding-bottom: 4px; }
  .pb-2 { padding-bottom: 8px; }
  .pb-4 { padding-bottom: 16px; }
  .mt-1 { margin-top: 4px; }
  .mt-2 { margin-top: 8px; }
  .mt-3 { margin-top: 12px; }
  .mt-4 { margin-top: 16px; }
  .mt-6 { margin-top: 24px; }
  .mb-1 { margin-bottom: 4px; }
  .mb-2 { margin-bottom: 8px; }
  .mb-3 { margin-bottom: 12px; }
  .mb-4 { margin-bottom: 16px; }
  .mr-1 { margin-right: 4px; }
  .mr-2 { margin-right: 8px; }
  .ml-1 { margin-left: 4px; }
  .-m-1 { margin: -4px; }
  .-mx-2 { margin-left: -8px; margin-right: -8px; }
  .-mx-4 { margin-left: -16px; margin-right: -16px; }
  .-mb-2 { margin-bottom: -8px; }
  .text-\\[8px\\] { font-size: 8px; }
  .text-\\[9px\\] { font-size: 9px; }
  .text-\\[10px\\] { font-size: 10px; }
  .text-xs { font-size: 12px; }
  .text-sm { font-size: 14px; }
  .text-base { font-size: 16px; }
  .text-lg { font-size: 18px; }
  .text-xl { font-size: 20px; }
  .text-2xl { font-size: 24px; }
  .font-bold { font-weight: 700; }
  .font-semibold { font-weight: 600; }
  .font-medium { font-weight: 500; }
  .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  .uppercase { text-transform: uppercase; }
  .tracking-wide { letter-spacing: 0.025em; }
  .leading-tight { line-height: 1.25; }
  .leading-snug { line-height: 1.375; }
  .whitespace-nowrap { white-space: nowrap; }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .underline { text-decoration: underline; }
  .italic { font-style: italic; }
  .opacity-90 { opacity: 0.9; }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
  .text-left { text-align: left; }
  td.text-right, th.text-right { text-align: right; }
  td.text-center, th.text-center { text-align: center; }
  .overflow-hidden { overflow: hidden; }
  .bg-white { background-color: #ffffff; }
  .bg-gray-50 { background-color: #f9fafb; }
  .bg-gray-100 { background-color: #f3f4f6; }
  .bg-gray-300 { background-color: #d1d5db; }
  .bg-green-50 { background-color: #f0fdf4; }
  .bg-green-100 { background-color: #dcfce7; }
  .bg-orange-50 { background-color: #fff7ed; }
  .bg-yellow-50 { background-color: #fefce8; }
  .bg-blue-50 { background-color: #eff6ff; }
  .bg-teal-600 { background-color: #0d9488; }
  .bg-gradient-to-r { background-image: linear-gradient(to right, var(--tw-gradient-stops)); }
  .from-sky-50 { --tw-gradient-from: #f0f9ff; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, transparent); }
  .to-cyan-50 { --tw-gradient-to: #ecfeff; }
  .text-black { color: #000000; }
  .text-white { color: #ffffff; }
  .text-gray-500 { color: #6b7280; }
  .text-gray-600 { color: #4b5563; }
  .text-red-600 { color: #dc2626; }
  .text-green-600 { color: #16a34a; }
  .text-green-700 { color: #15803d; }
  .text-blue-600 { color: #2563eb; }
  .text-orange-600 { color: #ea580c; }
  .text-teal-700 { color: #0f766e; }
  .text-sky-800 { color: #075985; }
  .border { border: 1px solid #ddd; }
  .border-2 { border: 2px solid #ddd; }
  .border-t { border-top: 1px solid #ddd; }
  .border-b { border-bottom: 1px solid #ddd; }
  .border-l-4 { border-left: 4px solid #ddd; }
  .border-t-2 { border-top: 2px solid #ddd; }
  .border-b-2 { border-bottom: 2px solid #ddd; }
  .border-black { border-color: #000; }
  .border-gray-200 { border-color: #e5e7eb; }
  .border-gray-300 { border-color: #d1d5db; }
  .border-gray-400 { border-color: #9ca3af; }
  .border-green-500 { border-color: #22c55e; }
  .border-orange-400 { border-color: #fb923c; }
  .border-sky-300 { border-color: #7dd3fc; }
  .border-dashed { border-style: dashed; }
  .border-collapse { border-collapse: collapse; }
  .rounded { border-radius: 4px; }
  .rounded-md { border-radius: 6px; }
  .rounded-lg { border-radius: 8px; }
`;

function loadScript(doc: Document, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = doc.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    doc.head.appendChild(script);
  });
}

export async function shareReceiptAsPdf(
  contentElement: HTMLElement,
  filename: string
): Promise<void> {
  const receiptHTML = contentElement.outerHTML;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "0";
  iframe.style.width = "820px";
  iframe.style.height = "1200px";
  iframe.style.border = "none";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    throw new Error("Could not access iframe document");
  }

  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>${RECEIPT_BASE_STYLES}</style>
      </head>
      <body>
        <div id="receipt-root" style="width:800px;">${receiptHTML}</div>
      </body>
    </html>
  `);
  iframeDoc.close();

  await new Promise((r) => setTimeout(r, 300));

  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  try {
    await loadScript(iframeDoc, HTML2CANVAS_CDN);
    await loadScript(iframeDoc, JSPDF_CDN);

    await new Promise((r) => setTimeout(r, 200));

    const iframeWindow = iframe.contentWindow as any;
    const html2canvasFn = iframeWindow.html2canvas;
    const jsPDFClass = iframeWindow.jspdf?.jsPDF;

    if (!html2canvasFn || !jsPDFClass) {
      throw new Error("Libraries not available");
    }

    const receiptRoot = iframeDoc.getElementById("receipt-root");
    if (!receiptRoot) {
      throw new Error("Receipt root not found");
    }

    const canvas = await html2canvasFn(receiptRoot, {
      scale: isMobileDevice ? 1.5 : 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: 800,
      windowWidth: 820,
      scrollX: 0,
      scrollY: 0,
    });

    const imgWidth = 210;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const pdf = new jsPDFClass("p", "mm", "a4");
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

    const downloadPdf = () => {
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
          downloadPdf();
        }
      }
    } else {
      downloadPdf();
    }
  } catch (cdnError) {
    console.warn("PDF generation failed, falling back to print:", cdnError);
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${filename}</title>
            <style>
              ${RECEIPT_BASE_STYLES}
              @media print { body { padding: 10px; } }
            </style>
          </head>
          <body>${receiptHTML}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  } finally {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  }
}
