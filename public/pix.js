// QR estático BR Code, gerado localmente. Não confirma nem executa pagamentos.
// Referência: Manual de Padrões para Iniciação do Pix, BCB, seção 2.6.
(() => {
  const field = (id, value) => {
    if (!value || value.length > 99 || /[^\x20-\x7e]/.test(value)) throw new Error('Campo Pix inválido.');
    return id + String(value.length).padStart(2,'0') + value;
  };
  const normalize = (value, limit) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,'').replace(/\s+/g,' ').trim().slice(0,limit);
  function crc16(value) {
    let crc = 0xffff;
    for (const char of value) {
      crc ^= char.charCodeAt(0) << 8;
      for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4,'0');
  }
  function payload({key, name, city, cents, reference}) {
    const merchant = normalize(name,25), location = normalize(city,15);
    if (!merchant || !location || !key || key.length > 77 || !Number.isSafeInteger(cents) || cents <= 0 || cents > 99999999999) throw new Error('Dados do Pix incompletos.');
    const txid = String(reference || '').replace(/[^a-zA-Z0-9]/g,'').slice(0,25) || '***';
    const value = field('00','01') + field('26',field('00','br.gov.bcb.pix') + field('01',key)) + field('52','0000') + field('53','986') + field('54',(cents/100).toFixed(2)) + field('58','BR') + field('59',merchant) + field('60',location) + field('62',field('05',txid)) + '6304';
    return value + crc16(value);
  }
  function draw(canvas, value) {
    const qr = window.qrcode(0,'M'); qr.addData(value,'Byte'); qr.make();
    const count = qr.getModuleCount(), quiet = 4, scale = 6;
    canvas.width = canvas.height = (count + quiet * 2) * scale;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = '#000';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r,c)) ctx.fillRect((c+quiet)*scale,(r+quiet)*scale,scale,scale);
  }
  window.RIFA_PIX = {payload, draw, crc16};
})();
