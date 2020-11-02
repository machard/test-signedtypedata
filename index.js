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

// see https://github.com/machard/ledger-live-common/blob/LL-3715/src/families/ethereum/hw-signMessage.js#L109
const signMessage = require("@ledgerhq/live-common/lib/hw/signMessage").default;

const wcUtilities = require("walletconnect-example-dapp/src/helpers/utilities.ts");
const { eip712 } = require("walletconnect-example-dapp/src/helpers/eip712.ts");

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

  console.log(message);

  await timeout(1000);

  result = await withDevice(deviceId)((t) =>
    from(signMessage(t, message))
  )
    .pipe(take(1))
    .toPromise();
  result = result.signature;

  // see https://github.com/WalletConnect/walletconnect-example-dapp/blob/61f1ea192cd5060c37ff876972058b7d4c41303b/src/App.tsx#L359
  hash = wcUtilities.hashPersonalMessage(messageData);
  valid = await wcUtilities.verifySignature(account.freshAddress, result, hash, account.currency.ethereumLikeInfo.chainId);

  console.log("result validity", result, valid);

  console.log("----testing typedmessage");

  messageData = eip712.example;

  message = {
    path: account.freshAddressPath,
    message: messageData,
    currency: getCryptoCurrencyById("ethereum"),
    derivationMode: account.derivationMode,
  };

  console.log(message);

  await timeout(1000);

  result = await withDevice(deviceId)((t) =>
    from(signMessage(t, message))
  )
    .pipe(take(1))
    .toPromise();
  result = result.signature;

  // see https://github.com/WalletConnect/walletconnect-example-dapp/blob/61f1ea192cd5060c37ff876972058b7d4c41303b/src/App.tsx#L409
  hash = wcUtilities.hashTypedDataMessage(JSON.stringify(messageData));
  valid = await wcUtilities.verifySignature(account.freshAddress, result, hash, account.currency.ethereumLikeInfo.chainId);

  console.log("result validity", result, valid);
};

main();
