import * as React from "react";
import { BrowserRouter, Switch, Route, Link } from 'react-router-dom';
import { hot } from "react-hot-loader";

import { CoingeckoProvider } from '../contexts/coingecko';
import { ConnectionProvider } from '../contexts/ConnectionContext';
import { SPLTokenListProvider } from '../contexts/tokenList';
import { WalletProvider } from '../contexts/WalletContext';
import {
  Cog,
  CurrentUserBadge,
} from './CurrentUserBadge';

import { shortenAddress } from '../utils/common';
import { Layout, Tooltip } from 'antd';
import { CopyOutlined } from '@ant-design/icons';


import { ConnectButton } from './ConnectButton';
import { useWallet } from '@solana/wallet-adapter-react';
export const LogoLink = () => {
  return (
    <Link to={`/`}>
      <p className={"janus-logo"}>Janus</p>
    </Link>
  );
};

export const AppBar = () => {
  const { connected } = useWallet();
  return (
    <>
      <div id="desktop-navbar">
        <div className="app-left">
          <LogoLink />
        </div>
        <div className="app-right">
          {/*!connected && (
            <HowToBuyModal buttonClassName="modal-button-default" />
          )*/}
          {!connected && (
            <ConnectButton style={{ height: 48 }} allowWalletChange />
          )}
          {connected && (
            <>
              <CurrentUserBadge
                showBalance={false}
                showAddress={true}
                iconSize={24}
              />
              <Cog />
            </>
          )}
        </div>
      </div>
    </>
  );
};

import { WalletSigner } from "../contexts/WalletContext";
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import * as bs58 from 'bs58';
import init, {
  elgamal_keypair_from_signature,
  elgamal_decrypt_u32,
} from '../utils/privateMetadata/private_metadata_js';
import { decodePrivateMetadata, PrivateMetadataAccount } from '../utils/privateSchema';
import { PRIVATE_METADATA_PROGRAM_ID } from '../utils/ids';
async function getPrivateMetadata(
  mint: PublicKey,
): Promise<PublicKey> {
  return (
    await PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        mint.toBuffer(),
      ],
      PRIVATE_METADATA_PROGRAM_ID,
    )
  )[0];
};

async function getElgamalKeypair(
  connection: Connection,
  wallet: WalletSigner,
  address: PublicKey,
): Promise<Uint8Array> {
  let transaction = new Transaction();
  transaction.add(new TransactionInstruction({
    programId: address, // mint
    keys: [],
    data: Buffer.from("ElGamalSecretKey"),
  }));

  const blockhash_bytes = 32;
  transaction.recentBlockhash = bs58.encode(
    new Array(blockhash_bytes).fill(0)
  );

  transaction.setSigners(wallet.publicKey);

  const signature = await wallet.signMessage(
      transaction.compileMessage().serialize());
  if (signature === null) {
    throw new Error(`Failed ElGamal keypair generation: signature`);
  }
  console.log('Signature {}', bs58.encode(signature));

  await init();
  return elgamal_keypair_from_signature([...signature]);
}

async function getCipherKey(
  connection: Connection,
  wallet: WalletSigner,
  address: PublicKey,
  privateMetadata: PrivateMetadataAccount,
): Promise<Buffer> {
  const elgamalKeypair = getElgamalKeypair(connection, wallet, address);

  return Buffer.concat(privateMetadata.encryptedCipherKey.map(
    chunk => (
      Buffer.from(elgamal_decrypt_u32(
        elgamalKeypair,
        { bytes: [...chunk] },
      ))
    )));
}

import { Button, Input } from 'antd';
import { useConnection } from '../contexts/ConnectionContext';
import { useLocalStorageState } from '../utils/common';
import * as CryptoJS from 'crypto-js';
export const Demo = () => {
  const connection = useConnection();
  const wallet = useWallet();

  const [mint, setMint] = useLocalStorageState('mint', '');
  const [privateMetadata, setPrivateMetadata]
      = React.useState<PrivateMetadataAccount | null>(null);
  const [privateImage, setPrivateImage]
      = React.useState<Buffer | null>(null);
  const [decryptedImage, setDecryptedImage]
      = React.useState<Buffer | null>(null);

  const parseAddress = (address: string): PublicKey | null => {
    try {
      return new PublicKey(address);
    } catch {
      return null;
    }
  };

  React.useEffect(() => {
    const mintKey = parseAddress(mint);
    if (mintKey === null) return;

    const wrap = async () => {
      const privateMetadataKey = await getPrivateMetadata(mintKey);
      const privateMetadataAccount = await connection.getAccountInfo(privateMetadataKey);
      const privateMetadata = decodePrivateMetadata(privateMetadataAccount.data);

      setPrivateMetadata(privateMetadata);
    };
    wrap();
  }, [connection, mint]);

  React.useEffect(() => {
    if (privateMetadata === null) return;
    const wrap = async () => {
      setPrivateImage(Buffer.from(
        await (
          await fetch(privateMetadata.uri)
        ).arrayBuffer()
      ));
    };
    wrap();
  }, [privateMetadata]);

  return (
    <div className="app">
      <AppBar />
      <Input
        id="mint-text-field"
        value={mint}
        onChange={(e) => setMint(e.target.value)}
        style={{ fontFamily: 'Monospace' }}
      />
      {privateImage && <img
        src={"data:image/png;base64," + privateImage.toString('base64')}
      />}
      {decryptedImage && <img
        src={"data:image/png;base64," + decryptedImage.toString('base64')}
      />}
      <Button
        disabled={!privateMetadata}
        onClick={() => {
          if (!privateMetadata) {
            return;
          }
          const mintKey = parseAddress(mint);
          if (mintKey === null) {
            console.error(`Failed to parse mint ${mint}`);
          }
          const wrap = async () => {
            const cipherKey = await getCipherKey(
              connection, wallet, mintKey, privateMetadata);
            console.log(`Decoded cipher key bytes: ${[...cipherKey]}`);
            console.log(`Decoded cipher key: ${bs58.encode(cipherKey)}`);

            const input = Buffer.from(await (await fetch(privateMetadata.uri)).arrayBuffer());
            const AES_BLOCK_SIZE = 16;
            const iv = input.slice(0, AES_BLOCK_SIZE);

            // expects a base64 encoded string by default (openSSL mode?)
            // also possible to give a `format: CryptoJS.format.Hex`
            const ciphertext = input.slice(AES_BLOCK_SIZE).toString('base64');
            // this can be a string but I couldn't figure out which encoding it
            // wants so just make it a WordArray
            const cipherKeyWordArray
              = CryptoJS.enc.Base64.parse(cipherKey.toString('base64'));
            const ivWordArray
              = CryptoJS.enc.Base64.parse(iv.toString('base64'));

            const decrypted = CryptoJS.AES.decrypt(
              ciphertext,
              cipherKeyWordArray,
              { iv: ivWordArray },
            );

            setDecryptedImage(Buffer.from(decrypted.toString(), 'hex'));
          }
          wrap();
        }}
      >
        Decrypt
      </Button>
    </div>
  );
}

export const App = () => {
  return (
    <BrowserRouter>
      <Switch>
        <ConnectionProvider>
        <WalletProvider>
        <SPLTokenListProvider>
        <CoingeckoProvider>
          <Layout>
              <Route path="/" component={() => (
                <Demo />
              )} />
          </Layout>
        </CoingeckoProvider>
        </SPLTokenListProvider>
        </WalletProvider>
        </ConnectionProvider>
      </Switch>
    </BrowserRouter>
  );
}

declare let module: Record<string, unknown>;

export default hot(module)(App);