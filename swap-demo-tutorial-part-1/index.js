//TODO: Show the percentage breakdown where a swap was sourced from using the
//  sourcesresponse param (ex: the best price comes from 50% Uniswap, 50% Kyber)
//TODO: Currently we set the token allowance is set to the max amount. Change
//  this to be safer so the user only approves just the amount needed.
//TODO: Calculate price when a user enters new “to” token (right now it only
//  auto-calculates when a user enters a new "from" token)
//TODO: Show estimated gas in $
//TODO: Filter down the long tokens list
//TODO: Allows users to switch chains and receive a proper quote (remember the
//  tokenlist will change as well!)

const qs = require("qs");
const Web3 = require("web3");
const { default: BigNumber } = require("bignumber.js");

const loginButton = document.getElementById("login_button");
const fromTokenSelect = document.getElementById("from_token_select");
const toTokenSelect = document.getElementById("to_token_select");
const tokenModal = document.getElementById("token_modal");
const modalClose = document.getElementById("modal_close");
const tokenList = document.getElementById("token_list");
const fromTokenImage = document.getElementById("from_token_image");
const fromTokenText = document.getElementById("from_token_text");
const toTokenImage = document.getElementById("to_token_image");
const toTokenText = document.getElementById("to_token_text");
const fromAmount = document.getElementById("from_amount");
const toAmount = document.getElementById("to_amount");
const gasEstimate = document.getElementById("gas_estimate");
const swapButton = document.getElementById("swap_button");
const apiHost = "goerli.api.0x.org";

let currentTrade = {};
let currentSelectSide;
let tokens;

async function init() {
    listAvailableTokens();
}

async function listAvailableTokens() {
    console.log("initializing");
    /*
    const response = await fetch(
        "https://tokens.coingecko.com/uniswap/all.json"
    );
    const tokenListJSON = await response.json();
    console.log("listing available tokens:", tokenListJSON);
    
    tokenListJSON.tokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
    tokenListJSON.tokens = tokenListJSON.tokens.filter(
        (a) => ["TST", "WEENUS"].indexOf(a.symbol) > -1
    );
    */
    const tokenListJSON = {
        tokens: [
            {
                address: "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6",
                chainId: 1,
                decimals: 18,
                logoURI:
                    "https://assets.coingecko.com/coins/images/2518/thumb/weth.png?1628852295",
                name: "Wrapped Ether",
                symbol: "WETH",
            },
            {
                address: "0x07865c6e87b9f70255377e024ace6630c1eaa37f",
                chainId: 1,
                decimals: 6,
                logoURI:
                    "https://assets.coingecko.com/coins/images/325/thumb/Tether.png?1668148663",
                name: "Tether",
                symbol: "USDT",
            },
            {
                address: "0x63bfb2118771bd0da7a6936667a7bb705a06c1ba",
                chainId: 1,
                decimals: 18,
                logoURI:
                    "https://assets.coingecko.com/coins/images/877/thumb/chainlink-new-logo.png?1547034700",
                symbol: "LINK",
            },
        ],
    };
    const { tokens } = tokenListJSON;
    console.log("tokens:", tokens);

    for (const i in tokens) {
        const div = document.createElement("div");
        div.className = "token_row";
        const html = `<img class="token_list_img" src="${tokens[i].logoURI}" />
            <span class="token_list_text">${tokens[i].symbol}</span>`;
        div.innerHTML = html;
        div.onclick = () => {
            selectToken(tokens[i]);
        };
        tokenList.appendChild(div);
    }
}

function selectToken(token) {
    closeModal();
    currentTrade[currentSelectSide] = token;
    console.log("currentTrade:", currentTrade);
    renderInterface();
}

function renderInterface() {
    if (currentTrade.from) {
        fromTokenImage.src = currentTrade.from.logoURI;
        fromTokenText.innerHTML = currentTrade.from.symbol;
    }
    if (currentTrade.to) {
        toTokenImage.src = currentTrade.to.logoURI;
        toTokenText.innerHTML = currentTrade.to.symbol;
    }
}

async function connect() {
    if ("ethereum" in window) {
        await ethereum.request({ method: "eth_requestAccounts" });
        loginButton.innerHTML = "Connected";
        swapButton.disabled = false;
    } else {
        loginButton.innerHTML = "Please install MetaMask";
    }
}

function openModal(side) {
    currentSelectSide = side;
    tokenModal.style.display = "block";
}

function closeModal() {
    tokenModal.style.display = "none";
}

async function getPrice() {
    console.log("getting price");
    if (!currentTrade.from || !currentTrade.to || !fromAmount.value) return;

    const amount = Number(fromAmount.value * 10 ** currentTrade.from.decimals);
    const params = {
        sellToken: currentTrade.from.address,
        buyToken: currentTrade.to.address,
        sellAmount: amount,
    };

    // fetch the swap price
    const response = await fetch(
        `https://${apiHost}/swap/v1/price?${qs.stringify(params)}`
    );

    const swapPriceJSON = await response.json();
    console.info("Estimated Price:", swapPriceJSON);

    toAmount.value = swapPriceJSON.buyAmount / 10 ** currentTrade.to.decimals;
    gasEstimate.innerHTML = swapPriceJSON.estimatedGas;
}

async function getQuote(account) {
    console.log("getting quote");
    if (!currentTrade.from || !currentTrade.to || !fromAmount.value) return;

    const amount = Number(fromAmount.value * 10 ** currentTrade.from.decimals);
    const params = {
        sellToken: currentTrade.from.address,
        buyToken: currentTrade.to.address,
        sellAmount: amount,
        takerAddress: account,
    };

    // fetch the swap quote
    const response = await fetch(
        `https://${apiHost}/swap/v1/quote?${qs.stringify(params)}`
    );

    const swapQuoteJSON = await response.json();
    console.info("Quote price:", swapQuoteJSON);

    toAmount.value = swapQuoteJSON.buyAmount / 10 ** currentTrade.to.decimals;
    gasEstimate.innerHTML = swapQuoteJSON.estimatedGas;

    return swapQuoteJSON;
}

async function trySwap() {
    console.log("trying swap");

    // set token allowance
    const web3 = new Web3(Web3.givenProvider);

    const accounts = await ethereum.request({ method: "eth_accounts" });
    const takerAddress = accounts[0];

    console.log("takerAddress:", takerAddress);

    const swapQuoteJSON = await getQuote(takerAddress);

    const fromTokenAddress = currentTrade.from.address;
    const erc20abi = [
        {
            inputs: [
                { internalType: "string", name: "name", type: "string" },
                { internalType: "string", name: "symbol", type: "string" },
                {
                    internalType: "uint256",
                    name: "max_supply",
                    type: "uint256",
                },
            ],
            stateMutability: "nonpayable",
            type: "constructor",
        },
        {
            anonymous: false,
            inputs: [
                {
                    indexed: true,
                    internalType: "address",
                    name: "owner",
                    type: "address",
                },
                {
                    indexed: true,
                    internalType: "address",
                    name: "spender",
                    type: "address",
                },
                {
                    indexed: false,
                    internalType: "uint256",
                    name: "value",
                    type: "uint256",
                },
            ],
            name: "Approval",
            type: "event",
        },
        {
            anonymous: false,
            inputs: [
                {
                    indexed: true,
                    internalType: "address",
                    name: "from",
                    type: "address",
                },
                {
                    indexed: true,
                    internalType: "address",
                    name: "to",
                    type: "address",
                },
                {
                    indexed: false,
                    internalType: "uint256",
                    name: "value",
                    type: "uint256",
                },
            ],
            name: "Transfer",
            type: "event",
        },
        {
            inputs: [
                { internalType: "address", name: "owner", type: "address" },
                { internalType: "address", name: "spender", type: "address" },
            ],
            name: "allowance",
            outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
        },
        {
            inputs: [
                { internalType: "address", name: "spender", type: "address" },
                { internalType: "uint256", name: "amount", type: "uint256" },
            ],
            name: "approve",
            outputs: [{ internalType: "bool", name: "", type: "bool" }],
            stateMutability: "nonpayable",
            type: "function",
        },
        {
            inputs: [
                { internalType: "address", name: "account", type: "address" },
            ],
            name: "balanceOf",
            outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
        },
        {
            inputs: [
                { internalType: "uint256", name: "amount", type: "uint256" },
            ],
            name: "burn",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
        },
        {
            inputs: [
                { internalType: "address", name: "account", type: "address" },
                { internalType: "uint256", name: "amount", type: "uint256" },
            ],
            name: "burnFrom",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
        },
        {
            inputs: [],
            name: "decimals",
            outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
            stateMutability: "view",
            type: "function",
        },
        {
            inputs: [
                { internalType: "address", name: "spender", type: "address" },
                {
                    internalType: "uint256",
                    name: "subtractedValue",
                    type: "uint256",
                },
            ],
            name: "decreaseAllowance",
            outputs: [{ internalType: "bool", name: "", type: "bool" }],
            stateMutability: "nonpayable",
            type: "function",
        },
        {
            inputs: [
                { internalType: "address", name: "spender", type: "address" },
                {
                    internalType: "uint256",
                    name: "addedValue",
                    type: "uint256",
                },
            ],
            name: "increaseAllowance",
            outputs: [{ internalType: "bool", name: "", type: "bool" }],
            stateMutability: "nonpayable",
            type: "function",
        },
        {
            inputs: [],
            name: "name",
            outputs: [{ internalType: "string", name: "", type: "string" }],
            stateMutability: "view",
            type: "function",
        },
        {
            inputs: [],
            name: "symbol",
            outputs: [{ internalType: "string", name: "", type: "string" }],
            stateMutability: "view",
            type: "function",
        },
        {
            inputs: [],
            name: "totalSupply",
            outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
        },
        {
            inputs: [
                { internalType: "address", name: "recipient", type: "address" },
                { internalType: "uint256", name: "amount", type: "uint256" },
            ],
            name: "transfer",
            outputs: [{ internalType: "bool", name: "", type: "bool" }],
            stateMutability: "nonpayable",
            type: "function",
        },
        {
            inputs: [
                { internalType: "address", name: "sender", type: "address" },
                { internalType: "address", name: "recipient", type: "address" },
                { internalType: "uint256", name: "amount", type: "uint256" },
            ],
            name: "transferFrom",
            outputs: [{ internalType: "bool", name: "", type: "bool" }],
            stateMutability: "nonpayable",
            type: "function",
        },
    ];

    const ERC20TokenContract = new web3.eth.Contract(
        erc20abi,
        fromTokenAddress
    );

    console.log("setup ERC20TokenContract:", ERC20TokenContract);

    const maxApproval = new BigNumber(2).pow(256).minus(1);

    ERC20TokenContract.methods
        .approve(swapQuoteJSON.allowanceTarget, maxApproval)
        .send({ from: takerAddress })
        .then((tx) => {
            console.log("tx:", tx);
        });

    const receipt = await web3.eth.sendTransaction(swapQuoteJSON);
    console.log("receipt:", receipt);
}

loginButton.onclick = connect;
fromTokenSelect.onclick = () => openModal("from");
toTokenSelect.onclick = () => openModal("to");
modalClose.onclick = closeModal;
fromAmount.onblur = getPrice;
swapButton.onclick = trySwap;

init();
