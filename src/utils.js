// Copyright © 2017-2020 Trust Wallet.
//
// This file is part of Trust. The full Trust copyright notice, including
// terms governing use, modification, and redistribution, is contained in the
// file LICENSE at the root of the source code distribution tree.

"use strict";

import { Buffer } from "buffer";

class Utils {
  static genId() {
    return new Date().getTime() + Math.floor(Math.random() * 1000);
  }

  static flatMap(array, func) {
    return [].concat(...array.map(func));
  }

  static intRange(from, to) {
    if (from >= to) {
      return [];
    }
    return new Array(to - from).fill().map((_, i) => i + from);
  }

  static hexToInt(hexString) {
    if (hexString === undefined || hexString === null) {
      return hexString;
    }
    return Number.parseInt(hexString, 16);
  }

  static intToHex(int) {
    if (int === undefined || int === null) {
      return int;
    }
    let hexString = int.toString(16);
    return "0x" + hexString;
  }

  // message: Bytes | string
  static messageToBuffer(message) {
    var buffer;
    if ((typeof (message) === "string") && message.indexOf("0x") === 0) {
      buffer = Buffer.from(message.replace("0x", ""), "hex");
    } else {
      buffer = Buffer.from(message);
    }
    return buffer;
  }

  static bufferToHex(buf) {
    return "0x" + Buffer.from(buf).toString("hex");
  }

  static handleSignParams(address, params) {
    if (!params) {
      return { data: "" };
    }
    if (params.length < 2) {
      return { data: params[0] };
    }
    if (address.toLowerCase() == params[0].toLowerCase()) {
      return { data: params[1] };
    } else {
      return { data: params[0] };
    }
  }

  static getIconLink() {
    var favicons = [];
    var nodeList = document.getElementsByTagName('link');
    for (var i = 0; i < nodeList.length; i++)
    {
      if((nodeList[i].getAttribute('rel') == 'icon') || (nodeList[i].getAttribute('rel') == 'shortcut icon'))
      {
        const node = nodeList[i];
        if (node.getAttribute('href') != null) {
          favicons.push({
              url: node.getAttribute('href'),
              sizes: node.getAttribute('sizes')
          });
        }
      }
    }
    if (favicons.length == 0) {
      return `${window.location.origin}/favicon.ico`;
    } else if( favicons[0].url.indexOf("://") > 0) {
      return favicons[0].url;
    } else {
      return `${window.location.origin}${favicons[0].url.indexOf("/") == 0 ? "": "/"}${favicons[0].url}`;
    }
  }
}

module.exports = Utils;
