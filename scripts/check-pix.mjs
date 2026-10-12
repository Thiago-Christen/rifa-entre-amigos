import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import vm from 'node:vm';
const context = vm.createContext({window:{}});
vm.runInContext(await readFile(new URL('../public/pix.js',import.meta.url),'utf8'),context);
vm.runInContext(await readFile(new URL('../public/vendor/qrcode-1.4.4.js',import.meta.url),'utf8'),context);
const pix = context.window.RIFA_PIX;
// Vetor de CRC oficial: BCB, Manual de Iniciação do Pix, seção 2.6.3.
const official = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
assert.equal(pix.crc16(official),'1D3D');
function parse(input) {
  const result = {};
  for (let pos = 0; pos < input.length;) {
    const tag = input.slice(pos,pos+2), length = Number(input.slice(pos+2,pos+4));
    assert.ok(Number.isInteger(length) && length>0 && pos+4+length<=input.length);
    result[tag] = input.slice(pos+4,pos+4+length); pos += 4+length;
  }
  return result;
}
for (const count of [1,2,10]) {
  const payload = pix.payload({key:'fixture@example.test',name:'José de Teste',city:'São Paulo',cents:count*1000,reference:'abcdef01-2345-6789-abcd-ef0123456789'});
  const data = parse(payload);
  assert.equal(data['54'],`${count*10}.00`); assert.equal(data['53'],'986'); assert.equal(data['58'],'BR');
  assert.equal(data['59'],'JOSE DE TESTE'); assert.equal(data['60'],'SAO PAULO');
  assert.equal(parse(data['26'])['01'],'fixture@example.test'); assert.equal(parse(data['26'])['00'],'br.gov.bcb.pix');
  assert.equal(parse(data['62'])['05'],'abcdef0123456789abcdef012');
  assert.equal(data['63'],pix.crc16(payload.slice(0,-4)));
}
assert.throws(()=>pix.payload({key:'fixture@example.test',name:'',city:'TESTE',cents:1000}));
assert.throws(()=>pix.payload({key:'fixture@example.test',name:'TESTE',city:'',cents:1000}));
assert.throws(()=>pix.payload({key:'fixture@example.test',name:'TESTE',city:'TESTE',cents:0}));
assert.throws(()=>pix.payload({key:'fixture@example.test',name:'TESTE',city:'TESTE',cents:1.5}));
const phone = pix.payload({key:'+5541999999999',name:'TESTE',city:'TESTE',cents:1000});
assert.equal(parse(parse(phone)['26'])['01'],'+5541999999999');
const example = pix.payload({key:'fixture@example.test',name:'TESTE NAO PAGAR',city:'CIDADE TESTE',cents:2000,reference:'fixtureqr123'});
const qr = context.qrcode(0,'M'); qr.addData(example,'Byte'); qr.make();
assert.ok(qr.getModuleCount()>=21);
await mkdir(new URL('../output/qa/',import.meta.url),{recursive:true});
await writeFile(new URL('../output/qa/pix-test.svg',import.meta.url),qr.createSvgTag(6,24));
await writeFile(new URL('../output/qa/pix-test-payload.txt',import.meta.url),example);
console.log('PASS: CRC oficial BCB, campos BR Code, valores de 1/2/10 números, chave telefone, limites e QR de teste gerado.');
