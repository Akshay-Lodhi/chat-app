import nacl from 'tweetnacl';
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

export const generateKeyPair = () => {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(keyPair.publicKey),
    privateKey: encodeBase64(keyPair.secretKey)
  };
};

export const encryptSymmetric = (message: string, key: Uint8Array) => {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const messageUint8 = decodeUTF8(message);
  const encrypted = nacl.secretbox(messageUint8, nonce, key);
  
  const fullMessage = new Uint8Array(nonce.length + encrypted.length);
  fullMessage.set(nonce);
  fullMessage.set(encrypted, nonce.length);
  
  return encodeBase64(fullMessage);
};

export const decryptSymmetric = (messageWithNonceBase64: string, key: Uint8Array) => {
  const messageWithNonceAsUint8Array = decodeBase64(messageWithNonceBase64);
  const nonce = messageWithNonceAsUint8Array.slice(0, nacl.secretbox.nonceLength);
  const message = messageWithNonceAsUint8Array.slice(nacl.secretbox.nonceLength, messageWithNonceBase64.length);
  
  const decrypted = nacl.secretbox.open(message, nonce, key);
  if (!decrypted) return null;
  return encodeUTF8(decrypted);
};

export const encryptKeyForUser = (symKey: Uint8Array, recipientPublicKeyBase64: string, senderPrivateKeyBase64: string) => {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const recipientPublicKey = decodeBase64(recipientPublicKeyBase64);
  const senderPrivateKey = decodeBase64(senderPrivateKeyBase64);
  
  const encrypted = nacl.box(symKey, nonce, recipientPublicKey, senderPrivateKey);
  
  const fullMessage = new Uint8Array(nonce.length + encrypted.length);
  fullMessage.set(nonce);
  fullMessage.set(encrypted, nonce.length);
  
  return encodeBase64(fullMessage);
};

export const decryptKeyFromUser = (encryptedKeyBase64: string, senderPublicKeyBase64: string, recipientPrivateKeyBase64: string) => {
  const messageWithNonceAsUint8Array = decodeBase64(encryptedKeyBase64);
  const nonce = messageWithNonceAsUint8Array.slice(0, nacl.box.nonceLength);
  const message = messageWithNonceAsUint8Array.slice(nacl.box.nonceLength, encryptedKeyBase64.length);
  
  const senderPublicKey = decodeBase64(senderPublicKeyBase64);
  const recipientPrivateKey = decodeBase64(recipientPrivateKeyBase64);
  
  return nacl.box.open(message, nonce, senderPublicKey, recipientPrivateKey);
};

export const createE2EEPayload = (
  plaintext: string, 
  participants: { userId: string, publicKey: string }[], 
  senderPrivateKey: string
) => {
  // 1. Generate random symmetric key
  const symKey = nacl.randomBytes(nacl.secretbox.keyLength);
  
  // 2. Encrypt message with symmetric key
  const ciphertext = encryptSymmetric(plaintext, symKey);
  
  // 3. Encrypt symmetric key for each participant (including sender so they can decrypt their own sent messages on another device, if keys sync)
  const encryptedKeys: Record<string, string> = {};
  for (const p of participants) {
    if (p.publicKey) {
      encryptedKeys[p.userId] = encryptKeyForUser(symKey, p.publicKey, senderPrivateKey);
    }
  }
  
  return {
    isEncrypted: true,
    ciphertext,
    encryptedKeys
  };
};

export const decryptE2EEPayload = (
  payload: any, 
  myUserId: string, 
  myPrivateKey: string, 
  senderPublicKey: string
) => {
  if (!payload || !payload.encryptedKeys || !payload.ciphertext) return null;
  
  const myEncryptedKey = payload.encryptedKeys[myUserId];
  if (!myEncryptedKey) return null; // We can't decrypt
  
  // Decrypt the symmetric key
  const symKey = decryptKeyFromUser(myEncryptedKey, senderPublicKey, myPrivateKey);
  if (!symKey) return null;
  
  // Decrypt the actual message
  return decryptSymmetric(payload.ciphertext, symKey);
};
