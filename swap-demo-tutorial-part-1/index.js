const loginButton = document.getElementById("login_button");

async function connect() {
    if ("ethereum" in window) {
        await ethereum.request({ method: "eth_requestAccounts" });
        loginButton.innerHTML = "Connected";
    } else {
        loginButton.innerHTML = "Please install MetaMask";
    }
}

loginButton.onclick = connect;
