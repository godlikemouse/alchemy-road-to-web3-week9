//TODO: Currently we set the token allowance is set to the max amount. Change
//  this to be safer so the user only approves just the amount needed.
//TODO: Allow users to switch chains and receive a proper quote (remember the
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
const tokenFilter = document.getElementById("token_filter");
const sourceEstimate = document.getElementById("source_estimate");
const apiHost = "api.0x.org";

let currentTrade = {};
let currentSelectSide;
let tokens;
let eth$ = 0;
const imageCache = {};

async function init() {
    listAvailableTokens();
    getEthDollarPrice();
}

async function getEthDollarPrice() {
    // get current eth in dollars
    const res = await fetch(
        "https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD"
    );
    eth$ = (await res.json()).USD;
}

function renderTokenList(tokens) {
    tokenList.innerHTML = "";
    for (const token of tokens) {
        const div = document.createElement("div");
        div.className = "token_row";

        const img = imageCache[token.symbol];
        const html = `<img class="token_list_img" src="${img.src}" />
            <span class="token_list_text">${token.symbol}</span>`;
        div.innerHTML = html;
        div.onclick = () => {
            selectToken(token);
        };
        tokenList.appendChild(div);
    }
}

async function listAvailableTokens() {
    console.log("initializing");
    const response = await fetch(
        "https://tokens.coingecko.com/uniswap/all.json"
    );
    const tokenListJSON = await response.json();
    console.log("listing available tokens:", tokenListJSON);
    tokenListJSON.tokens = tokenListJSON.tokens.filter(
        (a) => a.symbol && a.logoURI
    );

    for (const token of tokenListJSON.tokens) {
        if (!token.logoURI || !token.symbol) continue;
        const img = new Image();
        img.src = token.logoURI;
        imageCache[token.symbol] = img;
    }

    tokenListJSON.tokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
    tokens = tokenListJSON.tokens;
    console.log("tokens:", tokens);

    renderTokenList(tokens);
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
    tokenFilter.value = "";
    renderTokenList(tokens);
    currentSelectSide = side;
    tokenModal.style.display = "block";
}

function closeModal() {
    tokenModal.style.display = "none";
}

function updateEstimatedGas(estimate) {
    gasEstimate.innerHTML = `${estimate} GWEI, $${(
        estimate *
        0.000000001 *
        eth$
    ).toFixed(2)}`;
}

async function getPrice(e) {
    console.log("getting price");
    const value = e.target.value;
    if (!currentTrade.from || !currentTrade.to || !value) return;

    let sellToken = currentTrade.from.address;
    let buyToken = currentTrade.to.address;
    if (e.target.id == "to_amount") {
        sellToken = currentTrade.to.address;
        buyToken = currentTrade.from.address;
    }

    const sellAmount = Number(value * 10 ** currentTrade.from.decimals);
    const params = {
        sellToken,
        buyToken,
        sellAmount,
    };

    // fetch the swap price
    const response = await fetch(
        `https://${apiHost}/swap/v1/price?${qs.stringify(params)}`
    );

    const swapPriceJSON = await response.json();
    console.info("Estimated Price:", swapPriceJSON);

    const updateElement = e.target.id == "from_amount" ? toAmount : fromAmount;
    updateElement.value =
        swapPriceJSON.buyAmount / 10 ** currentTrade.to.decimals;

    updateEstimatedGas(swapPriceJSON.estimatedGas);

    //update source estimate
    const sources = swapPriceJSON.sources.filter(
        (a) => Number(a.proportion) > 0
    );
    const sourcesText = [];
    for (const source of sources) {
        sourcesText.push(`${Number(source.proportion) * 100}% ${source.name}`);
    }
    sourceEstimate.innerText = sourcesText.join(", ");
}

async function getQuote(takerAddress) {
    console.log("getting quote");
    if (!currentTrade.from || !currentTrade.to || !fromAmount.value) return;

    const sellAmount = Number(
        fromAmount.value * 10 ** currentTrade.from.decimals
    );

    const params = {
        sellToken: currentTrade.from.address,
        buyToken: currentTrade.to.address,
        sellAmount,
        takerAddress,
    };

    // fetch the swap quote
    const response = await fetch(
        `https://${apiHost}/swap/v1/quote?${qs.stringify(params)}`
    );

    const swapQuoteJSON = await response.json();
    console.info("Quote price:", swapQuoteJSON);

    toAmount.value = swapQuoteJSON.buyAmount / 10 ** currentTrade.to.decimals;

    updateEstimatedGas(swapQuoteJSON.estimatedGas);

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

function onFilterChange(e) {
    clearTimeout(onFilterChange.interval);
    onFilterChange.interval = setTimeout(() => {
        const { value } = e.target;
        let filteredTokens = tokens;
        if (value.length > 0) {
            filteredTokens = tokens.filter(
                (a) => a?.symbol?.toLowerCase().indexOf(value) > -1
            );
        }
        renderTokenList(filteredTokens);
    }, 250);
}

loginButton.onclick = connect;
fromTokenSelect.onclick = () => openModal("from");
toTokenSelect.onclick = () => openModal("to");
modalClose.onclick = closeModal;
fromAmount.onblur = getPrice;
toAmount.onblur = getPrice;
swapButton.onclick = trySwap;
tokenFilter.onkeyup = onFilterChange;

init();
