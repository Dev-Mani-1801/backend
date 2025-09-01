// generate-btc-keys.js
import * as bip32 from "bip32";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";

bitcoin.initEccLib(ecc);

// Create a random seed (32 bytes)
import { randomBytes } from "crypto";
const seed = randomBytes(64);

// Derive master key
const root = bip32.fromSeed(seed, bitcoin.networks.bitcoin);

// Derive account (BIP84: m/84'/0'/0')
const account = root.deriveHardened(84).deriveHardened(0).deriveHardened(0);

console.log("XPRV:", account.toBase58()); // extended private key (keep safe!)
console.log("XPUB:", account.neutered().toBase58()); // extended public key (safe for backend)
