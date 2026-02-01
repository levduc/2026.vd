// Use global Ethers from CDN if available, or window.ethereum
const { ethers } = window;

let provider;
let signer;
let exchangeContract;
let userAddress;

const connectBtn = document.getElementById('connect-wallet');
const adminPanel = document.getElementById('admin-panel');
const authMessage = document.getElementById('auth-message');

const buyRateDisplay = document.getElementById('current-buy-rate');
const sellRateDisplay = document.getElementById('current-sell-rate');

const btnUpdateRates = document.getElementById('btn-update-rates');
const btnWithdraw = document.getElementById('btn-withdraw');

// Initialize
async function init() {
    if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
    } else {
        alert("Please install MetaMask!");
    }
}

async function connectWallet() {
    if (!provider) return;

    try {
        const accounts = await provider.send("eth_requestAccounts", []);
        userAddress = accounts[0];
        signer = await provider.getSigner();

        // Update Button
        connectBtn.textContent = userAddress.substring(0, 6) + "..." + userAddress.substring(38);
        connectBtn.classList.remove('btn-primary');
        connectBtn.classList.add('btn-outline');

        // Check Admin Role
        checkAdminAccess();
    } catch (err) {
        console.error("Connection failed", err);
    }
}

async function checkAdminAccess() {
    try {
        exchangeContract = new ethers.Contract(
            CONFIG.VND_EXCHANGE_ADDRESS,
            CONFIG.VND_EXCHANGE_ABI,
            signer
        );

        const ADMIN_ROLE = await exchangeContract.ADMIN_ROLE();
        const isAdmin = await exchangeContract.hasRole(ADMIN_ROLE, userAddress);

        if (isAdmin) {
            authMessage.style.display = 'none';
            adminPanel.style.display = 'block';
            loadData();
        } else {
            authMessage.innerHTML = `<p class="subtitle" style="color: #FF6B6B">Access Denied: Wallet ${userAddress.substring(0, 6)}... is not an Admin.</p>`;
        }
    } catch (err) {
        console.error("Error checking role", err);
        authMessage.innerHTML = `<p class="subtitle">Error connecting to contract. Check Config Address.</p>`;
    }
}

async function loadData() {
    try {
        const buyRate = await exchangeContract.vndPerUsdToBuyVnd();
        const sellRate = await exchangeContract.vndPerUsdToSellVnd();

        buyRateDisplay.textContent = buyRate.toString();
        sellRateDisplay.textContent = sellRate.toString();
    } catch (err) {
        console.error("Error loading data", err);
    }
}

async function updateRates() {
    const buyInput = document.getElementById('input-buy-rate').value;
    const sellInput = document.getElementById('input-sell-rate').value;

    if (!buyInput || !sellInput) return alert("Please fill both rates");

    try {
        btnUpdateRates.textContent = "Updating...";
        const tx = await exchangeContract.setRates(buyInput, sellInput);
        await tx.wait();
        alert("Rates Updated Successfully!");
        loadData();
    } catch (err) {
        console.error(err);
        alert("Transaction Failed: " + (err.reason || err.message));
    } finally {
        btnUpdateRates.textContent = "Update Rates";
    }
}

async function withdraw() {
    const tokenAddr = document.getElementById('input-token-addr').value;
    const amount = document.getElementById('input-withdraw-amount').value; // In Wei

    if (!tokenAddr || !amount) return alert("Please fill details");

    try {
        btnWithdraw.textContent = "Processing...";
        const tx = await exchangeContract.withdraw(tokenAddr, amount);
        await tx.wait();
        alert("Withdrawal Successful!");
    } catch (err) {
        console.error(err);
        alert("Transaction Failed: " + (err.reason || err.message));
    } finally {
        btnWithdraw.textContent = "Withdraw Funds";
    }
}

// Event Listeners
connectBtn.addEventListener('click', connectWallet);
btnUpdateRates.addEventListener('click', updateRates);
btnWithdraw.addEventListener('click', withdraw);

init();
