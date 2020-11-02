require('dotenv').config();

const { first, map, reduce, tap, take } = require("rxjs/operators");
const { convertUtf8ToHex } = require("@walletconnect/utils");
const { from } = require("rxjs");
const {
  getCryptoCurrencyById,
  formatCurrencyUnit,
  parseCurrencyUnit,
} = require("@ledgerhq/live-common/lib/currencies");
const {
  getCurrencyBridge,
  getAccountBridge,
} = require("@ledgerhq/live-common/lib/bridge");
const { withDevice } = require("@ledgerhq/live-common/lib/hw/deviceAccess");
const signMessage = require("@ledgerhq/live-common/lib/hw/signMessage").default;

const wcUtilities = require("walletconnect-example-dapp/src/helpers/utilities.ts");
console.log(wcUtilities);

const currencyId = "ethereum";
const currency = getCryptoCurrencyById(currencyId);
const deviceId = "";

const { registerTransportModule } = require("@ledgerhq/live-common/lib/hw");
const TransportNodeHid = require("@ledgerhq/hw-transport-node-hid")
  .default;
const implementLibcore = require("@ledgerhq/live-common/lib/libcore/platforms/nodejs")
  .default;
const {
  setSupportedCurrencies,
} = require("@ledgerhq/live-common/lib/currencies");

setSupportedCurrencies([currencyId]);

// provide a libcore implementation
implementLibcore({
  lib: () => require("@ledgerhq/ledger-core"),
  dbPath: "./dbdata",
});

registerTransportModule({
  id: "hid",
  open: (devicePath) => TransportNodeHid.open(devicePath),
  disconnect: () => Promise.resolve(),
});

const timeout = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const main = async() => {
  const currencyBridge = getCurrencyBridge(currency);

  await currencyBridge.preload(currency);

  const syncConfig = { paginationConfig: {} };

  const scannedAccount = await currencyBridge
    .scanAccounts({ currency, deviceId, syncConfig })
    .pipe(
      // there can be many accounts, for sake of example we take first non empty
      first((e) => e.type === "discovered" && e.account.balance.gt(0)),
      map((e) => e.account)
    )
    .toPromise();

  const accountBridge = getAccountBridge(scannedAccount);

  const account = await accountBridge
    .sync(scannedAccount, syncConfig)
    .pipe(reduce((a, f) => f(a), scannedAccount))
    .toPromise();

  if (!account) {
    throw new Error("No account");
  }

  let message, messageData, result, hash, valid;

  console.log("----testing personal message");

  // test message
  messageData = "My email is john@doe.com - 1537836206101";

  message = {
    path: account.freshAddressPath,
    message: messageData,
    currency: getCryptoCurrencyById("ethereum"),
    derivationMode: account.derivationMode,
  };

  await timeout(1000);

  result = await withDevice(deviceId)((t) =>
    from(signMessage(t, message))
  )
    .pipe(take(1))
    .toPromise();
  result = result.signature;

  hash = wcUtilities.hashPersonalMessage(messageData);
  valid = await wcUtilities.verifySignature(account.freshAddress, result, hash, account.currency.ethereumLikeInfo.chainId);

  console.log("result validity", result, valid);

  console.log("----testing typedmessage");

  messageData = {
    "types": {
      "EIP712Domain": [{
        "name": "name",
        "type": "string"
      }, {
        "name": "version",
        "type": "string"
      }, {
        "name": "verifyingContract",
        "type": "address"
      }],
      "RelayRequest": [{
        "name": "target",
        "type": "address"
      }, {
        "name": "encodedFunction",
        "type": "bytes"
      }, {
        "name": "gasData",
        "type": "GasData"
      }, {
        "name": "relayData",
        "type": "RelayData"
      }],
      "GasData": [{
        "name": "gasLimit",
        "type": "uint256"
      }, {
        "name": "gasPrice",
        "type": "uint256"
      }, {
        "name": "pctRelayFee",
        "type": "uint256"
      }, {
        "name": "baseRelayFee",
        "type": "uint256"
      }],
      "RelayData": [{
        "name": "senderAddress",
        "type": "address"
      }, {
        "name": "senderNonce",
        "type": "uint256"
      }, {
        "name": "relayWorker",
        "type": "address"
      }, {
        "name": "paymaster",
        "type": "address"
      }]
    },
    "domain": {
      "name": "GSN Relayed Transaction",
      "version": "1",
      "chainId": 42,
      "verifyingContract": "0x6453D37248Ab2C16eBd1A8f782a2CBC65860E60B"
    },
    "primaryType": "RelayRequest",
    "message": {
      "target": "0x9cf40ef3d1622efe270fe6fe720585b4be4eeeff",
      "encodedFunction": "0xa9059cbb0000000000000000000000002e0d94754b348d208d64d52d78bcd443afa9fa520000000000000000000000000000000000000000000000000000000000000007",
      "gasData": {
        "gasLimit": "39507",
        "gasPrice": "1700000000",
        "pctRelayFee": "70",
        "baseRelayFee": "0"
      },
      "relayData": {
        "senderAddress": "0x22d491bde2303f2f43325b2108d26f1eaba1e32b",
        "senderNonce": "3",
        "relayWorker": "0x3baee457ad824c94bd3953183d725847d023a2cf",
        "paymaster": "0x957F270d45e9Ceca5c5af2b49f1b5dC1Abb0421c"
      }
    }
  };

  message = {
    path: account.freshAddressPath,
    message: messageData,
    currency: getCryptoCurrencyById("ethereum"),
    derivationMode: account.derivationMode,
  };

  await timeout(1000);

  result = await withDevice(deviceId)((t) =>
    from(signMessage(t, message))
  )
    .pipe(take(1))
    .toPromise();
  result = result.signature;

  hash = wcUtilities.hashTypedDataMessage(JSON.stringify(messageData));
  valid = await wcUtilities.verifySignature(account.freshAddress, result, hash, account.currency.ethereumLikeInfo.chainId);

  console.log("result validity", result, valid);
};

main();
