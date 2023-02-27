// Copyright © 2017-2020 Trust Wallet.
//
// This file is part of Trust. The full Trust copyright notice, including
// terms governing use, modification, and redistribution, is contained in the
// file LICENSE at the root of the source code distribution tree.

"use strict";

import Web3 from "web3";
import RPCServer from "./rpc";
import ProviderRpcError from "./error";
import Utils from "./utils";
import IdMapping from "./id_mapping";
import { EventEmitter } from "events";
import isUtf8 from "isutf8";
import { TypedDataUtils } from "eth-sig-util";

class TrustWeb3Provider extends EventEmitter {
  constructor(config) {
    super();
    this.setConfig(config);

    this.idMapping = new IdMapping();
    this.callbacks = new Map();
    this.wrapResults = new Map();
    this.isDebug = !!config.isDebug;
    this.isProxyRPC = !!config.isProxyRPC;

    this.emitConnect(this.chainId);
  }

  setAddress(address) {
    this.address = (address || "").toLowerCase();
    this.selectedAddress = this.address
    this.ready = !!address;
  }

  setConfig(config) {
    this.setAddress(config.address);

    this.chainId = Utils.intToHex(config.chainId);
    this.networkVersion = "" + config.chainId;

    this.rpc = new RPCServer(config.rpcUrl);
    this.isDebug = !!config.isDebug;
    this.isProxyRPC = !!config.isProxyRPC;
  }

  request(payload) {
    // this points to window in methods like web3.eth.getAccounts()
    var that = this;
    if (!(this instanceof TrustWeb3Provider)) {
      that = window.ethereum;
    }
    return that._request(payload, false);
  }

  /**
   * @deprecated Listen to "connect" event instead.
   */
  isConnected() {
    return true;
  }

  /**
   * @deprecated Use request({method: "eth_requestAccounts"}) instead.
   */
  enable() {
    console.log(
      'enable() is deprecated, please use window.ethereum.request({method: "eth_requestAccounts"}) instead.'
    );
    return this.request({ method: "eth_requestAccounts", params: [] });
  }

  /*
      ethereum.send() (DEPRECATED)
      ::: warning Use ethereum.request() instead. :::

      ethereum.send(
        methodOrPayload: string | JsonRpcRequest,
        paramsOrCallback: Array<unknown> | JsonRpcCallback,
      ): Promise<JsonRpcResponse> | void;
      This method behaves unpredictably and should be avoided at all costs. It is essentially an overloaded version of ethereum.sendAsync().

      ethereum.send() can be called in three different ways:

      // 1.
      ethereum.send(payload: JsonRpcRequest, callback: JsonRpcCallback): void;

      // 2.
      ethereum.send(method: string, params?: Array<unknown>): Promise<JsonRpcResponse>;

      // 3.
      ethereum.send(payload: JsonRpcRequest): unknown;
  */
  /*
      // 有效请求
      window.ethereum.send({method:"eth_requestAccounts"}, (error, result) => {
        console.log(error,result);
      });
      window.ethereum.send("eth_requestAccounts").then(result => {
        console.log(result);
      });
      

      // 无效请求
      window.ethereum.send({method:"eth_requestAccounts"}).then(result => {
        console.log(result);
      });
      window.ethereum.send("eth_requestAccounts", (error, result) => {
        console.log(error,result);
      });
  */

  /**
   * @deprecated Use request() method instead.
   */
  send(payloadOrMethod, callbackOrParams = null) {
    // console.log("send", payloadOrMethod);

    var isPayload = !(typeof payloadOrMethod == "string");
    var hasCallback = (typeof callbackOrParams == "function");

    let response;
    if (isPayload) {
      response = {
        jsonrpc: "2.0",
        id: payloadOrMethod.id || Utils.genId(),
        method: payloadOrMethod.method || "",
        params: payloadOrMethod.params || []
      };
    } else {
      response = {
        jsonrpc: "2.0",
        id: Utils.genId(),
        method: payloadOrMethod,
        params: callbackOrParams || []
      };
    }

    // this points to window in methods like web3.eth.getAccounts()
    var that = this;
    if (!(this instanceof TrustWeb3Provider)) {
      that = window.ethereum;
    }

    if (isPayload && hasCallback) {
      that._request(response)
          .then(data => { callbackOrParams(null, data); })
          .catch((error) => callback(error, null));
    } else if (!isPayload && !hasCallback) {
      return this._request(response)
          .then( (data) => { return Promise.resolve(data); })
          .catch((error) => { return Promise.reject(error); });
    } else {
      throw new Error(
        `MathWallet does not support calling ${response.method} synchronously without a callback. Please provide a callback parameter to call ${response.method} asynchronously.`
      );
    }
  }

  /**
   * @deprecated Use request() method instead.
   */
  sendAsync(payload, callback) {
    if (this.isDebug) {
      console.log(
        "sendAsync(data, callback) is deprecated, please use window.ethereum.request(data) instead."
      );
    }
    // this points to window in methods like web3.eth.getAccounts()
    var that = this;
    if (!(this instanceof TrustWeb3Provider)) {
      that = window.ethereum;
    }
    if (Array.isArray(payload)) {
      Promise.all(payload.map(that._request.bind(that)))
        .then((data) => callback(null, data))
        .catch((error) => callback(error, null));
    } else {
      that
        ._request(payload)
        .then((data) => callback(null, data))
        .catch((error) => callback(error, null));
    }
  }

  /**
   * @private Internal rpc handler
   */
  _request(payload, wrapResult = true) {
    this.idMapping.tryIntifyId(payload);
    if (this.isDebug) {
      console.log(`==> _request payload ${JSON.stringify(payload)}, wrapResult: ${wrapResult}`);
    }
    return new Promise((resolve, reject) => {
      if (!payload.id) {
        payload.id = Utils.genId();
      }
      if (!payload.jsonrpc) {
        payload.jsonrpc = "2.0";
      }
      this.callbacks.set(payload.id, (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
      this.wrapResults.set(payload.id, wrapResult);

      switch (payload.method) {
        case "eth_accounts":
          return this.sendResponse(payload.id, this.eth_accounts());
        case "eth_coinbase":
          return this.sendResponse(payload.id, this.eth_coinbase());
        case "net_version":
          return this.sendResponse(payload.id, this.net_version());
        case "eth_chainId":
          return this.sendResponse(payload.id, this.eth_chainId());
        case "eth_sign":
          return this.eth_sign(payload);
        case "personal_sign":
          return this.personal_sign(payload);
        case "personal_ecRecover":
          return this.personal_ecRecover(payload);
        case "eth_signTypedData_v3":
          return this.eth_signTypedData(payload, false);
        case "eth_signTypedData":
        case "eth_signTypedData_v4":
          return this.eth_signTypedData(payload, true);
        case "eth_sendTransaction":
          return this.eth_sendTransaction(payload);
        case "eth_requestAccounts":
          return this.eth_requestAccounts(payload);
        case "wallet_watchAsset":
          return this.wallet_watchAsset(payload);
        case "wallet_addEthereumChain":
          return this.wallet_addEthereumChain(payload);
        case "wallet_switchEthereumChain":
          return this.wallet_switchEthereumChain(payload);
        case "wallet_getPermissions":
          return this.wallet_getPermissions(payload);
        case "wallet_requestPermissions":
          return this.wallet_requestPermissions(payload);
        case "eth_newFilter":
        case "eth_newBlockFilter":
        case "eth_newPendingTransactionFilter":
        case "eth_uninstallFilter":
        case "eth_subscribe":
          throw new ProviderRpcError(
            4200,
            `MathWallet does not support calling ${payload.method}. Please use your own solution`
          );
        default:
          if (this.isProxyRPC) {
            if (this.isDebug) {
              console.log(`<== rpc request ${JSON.stringify(payload)} ${wrapResult}`);
            }
            return this.wallet_rpcCall(payload);
          } 
          // call upstream rpc
          this.callbacks.delete(payload.id);
          this.wrapResults.delete(payload.id);
          if (this.isDebug) {
            console.log(`<== rpc request ${JSON.stringify(payload)}`);
          }
          return this.rpc
            .call(payload)
            .then((response) => {
              if (this.isDebug) {
                console.log(`<== rpc response ${JSON.stringify(response)}`);
              }
              wrapResult ? resolve(response) : resolve(response.result);
            })
            .catch(reject);
      }
    });
  }

  emitConnect(chainId) {
    this.emit("connect", { chainId: chainId });
  }

  emitChainChanged(chainId) {
    this.emit("chainChanged", chainId);
    this.emit("networkChanged", chainId);
  }

  eth_accounts() {
    return this.address ? [this.address] : [];
  }

  eth_coinbase() {
    return this.address;
  }

  net_version() {
    return this.networkVersion;
  }

  eth_chainId() {
    return this.chainId;
  }

  wallet_rpcCall(payload) {
    this.postMessage("rpcCall", payload.id, payload);
  }

  eth_sign(payload) {
    const message = Utils.handleSignParams(this.address, payload.params).data;
    const buffer = Utils.messageToBuffer(message);
    const hex = Utils.bufferToHex(buffer);
    if (isUtf8(buffer)) {
      this.postMessage("signPersonalMessage", payload.id, { data: hex });
    } else {
      this.postMessage("signMessage", payload.id, { data: hex });
    }
  }

  personal_sign(payload) {
    const message = Utils.handleSignParams(this.address, payload.params).data;
    const buffer = Utils.messageToBuffer(message);
    if (buffer.length === 0) {
      // hex it
      const hex = Utils.bufferToHex(message);
      this.postMessage("signPersonalMessage", payload.id, { data: hex });
    } else {
      this.postMessage("signPersonalMessage", payload.id, { data: message });
    }
  }

  personal_ecRecover(payload) {
    this.postMessage("ecRecover", payload.id, {
      signature: payload.params[1],
      message: payload.params[0],
    });
  }

  eth_signTypedData(payload, useV4) {
    const message = JSON.parse(payload.params[1]);
    const hash = TypedDataUtils.sign(message, useV4);
    this.postMessage("signTypedMessage", payload.id, {
      data: "0x" + hash.toString("hex"),
      raw: payload.params[1],
      method: payload.method
    });
  }

  eth_sendTransaction(payload) {
    this.postMessage("signTransaction", payload.id, payload.params[0]);
  }

  eth_requestAccounts(payload) {
    this.postMessage("requestAccounts", payload.id, {});
  }

  wallet_watchAsset(payload) {
    let options = payload.params.options;
    this.postMessage("watchAsset", payload.id, {
      type: payload.type,
      contract: options.address,
      symbol: options.symbol,
      decimals: options.decimals || 0,
      image: options.image || "",
    });
  }

  wallet_addEthereumChain(payload) {
    this.postMessage("addEthereumChain", payload.id, payload.params[0]);
  }

  wallet_switchEthereumChain(payload) {
    this.postMessage("switchEthereumChain", payload.id, payload.params[0]);
  }

  wallet_getPermissions(payload) {
    this.postMessage("getPermissions", payload.id, {});
  }

  wallet_requestPermissions(payload) {
    this.postMessage("requestPermissions", payload.id, payload.params);
  }
  /**
   * @private Internal js -> native message handler
   */
  postMessage(handler, id, data) {
    if (this.ready || handler === "requestAccounts" || handler === "addEthereumChain" || handler === "switchEthereumChain" || handler === "getPermissions" || handler === "requestPermissions") {
      // android
      // window["ethWeb3"].postMessage(JSON.stringify({
        // "dapp": {
        //   "origin": window.location.origin,
        //   "icon": Utils.getIconLink()
        //  },
      //   "name": handler,
      //   "payload": data,
      //   "id": id
      // }));
      // iOS
      window.webkit.messageHandlers["ethWeb3"].postMessage({
       "dapp": {
        "origin": window.location.origin,
        "icon": Utils.getIconLink()
       },
        "name": handler,
        "payload": data,
        "id": "" + id
      });
    } else {
      // don't forget to verify in the app
      this.sendError(id, new ProviderRpcError(4100, "provider is not ready"));
    }
  }

  /**
   * @private Internal native result -> js
   */
  sendResponse(id, result) {
    let originId = this.idMapping.tryPopId(id) || id;
    let callback = this.callbacks.get(id);
    let wrapResult = this.wrapResults.get(id);
    let data = { jsonrpc: "2.0", id: originId };
    if (result != null && typeof result === "object" && result.jsonrpc && result.result) {
      data.result = result.result;
    } else {
      data.result = result;
    }
    if (this.isDebug) {
      console.log(
        `<== sendResponse id: ${id}, wrapResult: ${wrapResult}, result: ${JSON.stringify(result)}, data: ${JSON.stringify(data)}`
      );
    }
    if (callback) {
      wrapResult ? callback(null, data) : callback(null, result);
      this.callbacks.delete(id);
    } else {
      console.log(`callback id: ${id} not found`);
      // check if it's iframe callback
      for (var i = 0; i < window.frames.length; i++) {
        const frame = window.frames[i];
        try {
          if (frame.ethereum.callbacks.has(id)) {
            frame.ethereum.sendResponse(id, result);
          }
        } catch (error) {
          console.log(`send response to frame error: ${error}`);
        }
      }
    }
  }

  /**
   * @private Internal native error -> js
   */
  sendError(id, error) {
    console.log(`<== ${id} sendError ${error}`);
    let callback = this.callbacks.get(id);
    if (callback) {
      callback(error instanceof Error ? error : new Error(error), null);
      this.callbacks.delete(id);
    }
  }
}

window.Trust = TrustWeb3Provider;
window.Web3 = Web3;