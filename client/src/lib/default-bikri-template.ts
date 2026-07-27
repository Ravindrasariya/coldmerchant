// Default A4 template for the Bikri (sale) receipt. Mirrors the Loading
// receipt's default template, with Bikri-specific differences:
// - No Rate column (Item Name, Marka, Quantity, Weight, Value)
// - No charge/deduction line items: the SALES BILL notes block sits alone
//   and Net Amount equals the Total Value exactly.
export const defaultBikriTemplate = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #000; }
  .page { width: 210mm; height: 297mm; padding: 10mm 12mm; margin: 0 auto; display: flex; flex-direction: column; overflow: hidden; }
  .header { text-align: center; margin-bottom: 10px; }
  .header h1 { font-size: 28px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
  .header p { font-size: 13px; margin: 2px 0; }
  .header .tagline { font-size: 12px; margin-top: 6px; font-style: normal; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #000; padding: 5px 8px; vertical-align: top; font-size: 13px; }
  .buyer-table { margin-top: 10px; }
  .buyer-table td { height: 24px; }
  .buyer-name-cell { width: 55%; font-weight: bold; font-size: 15px; }
  .items-table th { background: #fff; font-weight: bold; text-align: center; padding: 6px 6px; }
  .items-table td { text-align: center; height: 24px; }
  .items-table tbody td { border-top: none; border-bottom: none; }
  .items-table td:first-child { text-align: left; }
  .items-table td:last-child { text-align: right; }
  .total-row td { font-weight: bold; border-top: 1px solid #000; border-bottom: 1px solid #000; }
  .charges-table td { border: 1px solid #000; padding: 4px 8px; font-size: 13px; }
  .charges-table td.no-border { border: none; }
  .net-amount-row td { font-weight: bold; border-top: 2px solid #000; }
  .words-row td { border: 1px solid #000; padding: 6px 8px; font-size: 13px; }
  .signature { text-align: right; padding-right: 20px; font-size: 14px; font-weight: bold; margin-top: auto; padding-bottom: 0; }
  @page { margin: 0; size: A4; }
  @media print {
    html, body { height: auto; margin: 0; padding: 0; }
    .page { padding: 8mm 10mm; height: auto; max-height: 297mm; overflow: hidden; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <h1>{{merchantName}}</h1>
    <p>{{merchantAddress}}</p>
    <p>Phone : Mobile&nbsp; &ndash; {{merchantContact}}</p>
    <p class="tagline">Commission Agent &amp; Order Suppliers of Potato, Onion, Garlic, Ginger &amp; Arbi</p>
  </div>

  <table class="buyer-table">
    <tr>
      <td class="buyer-name-cell" rowspan="4"><div style="display:flex;flex-direction:column;height:100%;min-height:90px"><div>{{buyerName}}</div>{{buyerContact}}</div></td>
      <td style="width:100px">Quantity</td>
      <td>{{totalBags}}</td>
    </tr>
    <tr>
      <td>Motor No.</td>
      <td>{{vehicleNumber}}</td>
    </tr>
    <tr>
      <td>Bill No.</td>
      <td>{{receiptNumber}}</td>
    </tr>
    <tr>
      <td>Bill Date</td>
      <td>{{date}}</td>
    </tr>
  </table>

  <table class="items-table" style="margin-top:-1px">
    <colgroup>
      <col style="width:22%">
      <col style="width:16%">
      <col style="width:16%">
      <col style="width:20%">
      <col style="width:26%">
    </colgroup>
    <thead>
      <tr>
        <th>Item Name</th>
        <th>Marka</th>
        <th>Quantity</th>
        <th>Weight</th>
        <th style="text-align:right">Value</th>
      </tr>
    </thead>
    <tbody>
      {{itemRowsHtml}}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td>Total</td>
        <td></td>
        <td>{{totalBags}}</td>
        <td>{{totalWeight}}</td>
        <td style="text-align:right">{{totalAmount}}</td>
      </tr>
    </tfoot>
  </table>

  <table class="charges-table" style="margin-top:-1px;border-collapse:collapse;width:100%">
    <colgroup>
      <col style="width:22%">
      <col style="width:16%">
      <col style="width:16%">
      <col style="width:20%">
      <col style="width:26%">
    </colgroup>
    <tbody>
      <tr>
        <td colspan="2" rowspan="2" style="vertical-align:top;border:1px solid #000"><div style="font-weight:bold">SALES BILL</div><div style="font-weight:normal;font-size:12px;margin-top:8px;line-height:1.6">1. E.&amp; O.E.<br>2. Subject to INDORE Jurisdiction.<br>3. Sunday Closed.</div></td>
        <td colspan="2" style="border:1px solid #000">&nbsp;</td>
        <td style="border:1px solid #000">&nbsp;</td>
      </tr>
      <tr class="net-amount-row">
        <td colspan="2" style="border:1px solid #000">Net Amount</td>
        <td style="text-align:right;border:1px solid #000">{{grandTotal}}</td>
      </tr>
    </tbody>
  </table>

  <table style="margin-top:-1px">
    <tr class="words-row">
      <td>In Words: {{amountInWords}}</td>
    </tr>
  </table>

  <div class="signature">
    For {{merchantName}}
  </div>

</div>
</body>
</html>`;
