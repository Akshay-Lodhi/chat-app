const nacl = require('tweetnacl');
const { encodeBase64, decodeBase64, decodeUTF8 } = require('tweetnacl-util');

const generateKeyPair = () => {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(keyPair.publicKey),
    privateKey: encodeBase64(keyPair.secretKey)
  };
};

const keys = generateKeyPair();

const symKey = nacl.randomBytes(nacl.secretbox.keyLength);

const nonce = nacl.randomBytes(nacl.box.nonceLength);
const recipientPublicKey = decodeBase64(keys.publicKey);
const senderPrivateKey = decodeBase64(keys.privateKey);

const encrypted = nacl.box(symKey, nonce, recipientPublicKey, senderPrivateKey);

const decrypted = nacl.box.open(encrypted, nonce, recipientPublicKey, senderPrivateKey);

console.log("Success?", !!decrypted);
