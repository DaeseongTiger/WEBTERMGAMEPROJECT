/*const crc = require('crc');

function generatePromptPayQRCode(phoneNumber, amount) {
    const sanitizedPhone = phoneNumber.replace(/[^0-9]/g, '');
    const formattedPhone = sanitizedPhone.startsWith('0') 
        ? '66' + sanitizedPhone.slice(1) 
        : sanitizedPhone;

    const formattedAmount = amount.toFixed(2).replace('.', ''); 

    let payload = `00020101021129370016A000000677010111${formattedPhone}5802TH5303764`;

    if (formattedAmount.length > 0) {
        payload += `54${formattedAmount.length}${formattedAmount}`;
    }

    payload += '6304';

    const crcValue = crc.crc16xmodem(payload, 0xffff);
    const formattedCrc = ('0000' + crcValue.toString(16).toUpperCase()).slice(-4);

    return payload + formattedCrc;
}

module.exports = generatePromptPayQRCode;*/