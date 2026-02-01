// DanhDe Frontend Application

let provider = null;
let signer = null;
let danhDeContract = null;
let userAddress = null;
let selectedNumber = null;
let selectedToken = null;
let currentRound = null;
let countdownInterval = null;

// DOM Elements
const connectBtn = document.getElementById('connectBtn');
const roundIdEl = document.getElementById('roundId');
const roundStatusEl = document.getElementById('roundStatus');
const totalBetsEl = document.getElementById('totalBets');
const multiplierEl = document.getElementById('multiplier');
const timeLeftEl = document.getElementById('timeLeft');
const numberGrid = document.getElementById('numberGrid');
const betNumberInput = document.getElementById('betNumber');
const tokenSelect = document.getElementById('tokenSelect');
const betAmountInput = document.getElementById('betAmount');
const balanceDisplay = document.getElementById('balanceDisplay');
const selectedNumberEl = document.getElementById('selectedNumber');
const betAmountDisplayEl = document.getElementById('betAmountDisplay');
const potentialWinEl = document.getElementById('potentialWin');
const placeBetBtn = document.getElementById('placeBetBtn');
const betsList = document.getElementById('betsList');
const resultsGrid = document.getElementById('resultsGrid');
const toastContainer = document.getElementById('toastContainer');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    generateNumberGrid();
    setupEventListeners();

    // Check if wallet is already connected
    if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            await connectWallet();
        }
    }
});

// Generate number grid (00-99)
function generateNumberGrid() {
    numberGrid.innerHTML = '';
    for (let i = 0; i < 100; i++) {
        const btn = document.createElement('button');
        btn.className = 'number-btn';
        btn.textContent = i.toString().padStart(2, '0');
        btn.dataset.number = i;
        btn.addEventListener('click', () => selectNumber(i));
        numberGrid.appendChild(btn);
    }
}

// Setup event listeners
function setupEventListeners() {
    connectBtn.addEventListener('click', connectWallet);

    // Number input
    betNumberInput.addEventListener('input', (e) => {
        let value = parseInt(e.target.value);
        if (value >= 0 && value <= 99) {
            selectNumber(value);
        }
    });

    // Random number
    document.querySelector('[data-number="random"]').addEventListener('click', () => {
        const randomNum = Math.floor(Math.random() * 100);
        selectNumber(randomNum);
        betNumberInput.value = randomNum;
    });

    // Token select
    tokenSelect.addEventListener('change', async (e) => {
        selectedToken = e.target.value;
        if (selectedToken && userAddress) {
            await updateBalance();
        }
        updateBetSummary();
    });

    // Amount input
    betAmountInput.addEventListener('input', updateBetSummary);

    // Amount presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = btn.dataset.amount;
            if (selectedToken) {
                const tokenInfo = Object.values(DANHDE_CONFIG.TOKENS).find(t => t.address === selectedToken);
                if (tokenInfo) {
                    // Convert VND amount to token amount
                    const rate = tokenInfo.symbol === 'VND' ? 1 : 25000; // Adjust based on actual rate
                    const tokenAmount = parseFloat(amount) / rate;
                    betAmountInput.value = tokenAmount;
                    updateBetSummary();
                }
            }
        });
    });

    // Max button
    document.getElementById('maxBtn').addEventListener('click', async () => {
        if (selectedToken && userAddress) {
            const tokenInfo = Object.values(DANHDE_CONFIG.TOKENS).find(t => t.address === selectedToken);
            if (tokenInfo) {
                const tokenContract = new ethers.Contract(selectedToken, DANHDE_CONFIG.ERC20_ABI, provider);
                const balance = await tokenContract.balanceOf(userAddress);
                betAmountInput.value = ethers.utils.formatUnits(balance, tokenInfo.decimals);
                updateBetSummary();
            }
        }
    });

    // Place bet button
    placeBetBtn.addEventListener('click', placeBet);

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadBets(tab.dataset.tab);
        });
    });

    // Listen for account changes
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', () => window.location.reload());
    }
}

// Connect wallet
async function connectWallet() {
    if (!window.ethereum) {
        showToast('Please install MetaMask!', 'error');
        return;
    }

    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);

        // Request accounts
        const accounts = await provider.send('eth_requestAccounts', []);
        userAddress = accounts[0];

        // Check network
        const network = await provider.getNetwork();
        if (network.chainId !== DANHDE_CONFIG.NETWORK.chainId) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x' + DANHDE_CONFIG.NETWORK.chainId.toString(16) }]
                });
            } catch (switchError) {
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: '0x' + DANHDE_CONFIG.NETWORK.chainId.toString(16),
                            chainName: DANHDE_CONFIG.NETWORK.name,
                            rpcUrls: [DANHDE_CONFIG.NETWORK.rpcUrl],
                            blockExplorerUrls: [DANHDE_CONFIG.NETWORK.explorer]
                        }]
                    });
                }
            }
            provider = new ethers.providers.Web3Provider(window.ethereum);
        }

        signer = provider.getSigner();

        // Initialize contract
        danhDeContract = new ethers.Contract(
            DANHDE_CONFIG.DANHDE_ADDRESS,
            DANHDE_CONFIG.DANHDE_ABI,
            signer
        );

        // Update UI
        connectBtn.textContent = userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
        connectBtn.classList.add('connected');

        // Load data
        await loadRoundInfo();
        await loadTokens();
        await loadBets('active');
        await loadPastResults();

        // Start countdown
        startCountdown();

        showToast('Wallet connected!', 'success');

    } catch (error) {
        console.error('Connection error:', error);
        showToast('Failed to connect wallet', 'error');
    }
}

// Handle account changes
function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        userAddress = null;
        connectBtn.textContent = 'Connect Wallet';
        connectBtn.classList.remove('connected');
    } else {
        userAddress = accounts[0];
        connectBtn.textContent = userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
        loadBets('active');
    }
}

// Load round info
async function loadRoundInfo() {
    if (!danhDeContract) return;

    try {
        const round = await danhDeContract.getCurrentRound();
        currentRound = {
            id: round.roundId.toNumber(),
            startTime: round.startTime.toNumber(),
            endTime: round.endTime.toNumber(),
            resultTime: round.resultTime.toNumber(),
            winningNumber: round.winningNumber,
            cancelled: round.cancelled,
            totalBetsVND: round.totalBetsVND
        };

        roundIdEl.textContent = currentRound.id;
        totalBetsEl.textContent = formatVND(currentRound.totalBetsVND);

        const multiplier = await danhDeContract.payoutMultiplier();
        multiplierEl.textContent = multiplier.toString() + 'x';

        updateRoundStatus();

    } catch (error) {
        console.error('Failed to load round info:', error);
    }
}

// Update round status
function updateRoundStatus() {
    if (!currentRound) return;

    const now = Math.floor(Date.now() / 1000);

    if (currentRound.cancelled) {
        roundStatusEl.textContent = 'Cancelled';
        roundStatusEl.className = 'round-status closed';
    } else if (currentRound.resultTime > 0) {
        roundStatusEl.textContent = 'Finished';
        roundStatusEl.className = 'round-status closed';
    } else if (now < currentRound.endTime) {
        roundStatusEl.textContent = 'Open';
        roundStatusEl.className = 'round-status open';
    } else {
        roundStatusEl.textContent = 'Pending Result';
        roundStatusEl.className = 'round-status pending';
    }
}

// Start countdown
function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        if (!currentRound) return;

        const now = Math.floor(Date.now() / 1000);
        const timeLeft = Math.max(0, currentRound.endTime - now);

        timeLeftEl.textContent = formatTimeLeft(timeLeft);

        if (timeLeft === 0) {
            updateRoundStatus();
        }
    }, 1000);
}

// Load tokens
async function loadTokens() {
    tokenSelect.innerHTML = '<option value="">Select Token</option>';

    for (const [key, token] of Object.entries(DANHDE_CONFIG.TOKENS)) {
        if (token.address === '0x0000000000000000000000000000000000000000') continue;

        try {
            const isSupported = await danhDeContract.supportedTokens(token.address);
            if (isSupported) {
                const option = document.createElement('option');
                option.value = token.address;
                option.textContent = `${token.symbol} - ${token.name}`;
                tokenSelect.appendChild(option);
            }
        } catch (error) {
            console.error(`Failed to check token ${key}:`, error);
        }
    }
}

// Update balance
async function updateBalance() {
    if (!selectedToken || !userAddress) {
        balanceDisplay.textContent = '-- VND';
        return;
    }

    try {
        const tokenInfo = Object.values(DANHDE_CONFIG.TOKENS).find(t => t.address === selectedToken);
        const tokenContract = new ethers.Contract(selectedToken, DANHDE_CONFIG.ERC20_ABI, provider);
        const balance = await tokenContract.balanceOf(userAddress);

        balanceDisplay.textContent = formatToken(balance, tokenInfo.decimals, tokenInfo.symbol);

    } catch (error) {
        console.error('Failed to load balance:', error);
        balanceDisplay.textContent = 'Error';
    }
}

// Select number
function selectNumber(num) {
    selectedNumber = num;

    // Update grid
    document.querySelectorAll('.number-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (parseInt(btn.dataset.number) === num) {
            btn.classList.add('selected');
        }
    });

    // Update input
    betNumberInput.value = num;

    updateBetSummary();
}

// Update bet summary
async function updateBetSummary() {
    selectedNumberEl.textContent = selectedNumber !== null ? selectedNumber.toString().padStart(2, '0') : '--';

    const amount = parseFloat(betAmountInput.value) || 0;
    const tokenInfo = Object.values(DANHDE_CONFIG.TOKENS).find(t => t.address === selectedToken);

    if (amount > 0 && tokenInfo) {
        betAmountDisplayEl.textContent = formatToken(
            ethers.utils.parseUnits(amount.toString(), tokenInfo.decimals),
            tokenInfo.decimals,
            tokenInfo.symbol
        );

        // Calculate potential win
        let multiplier = 80;
        if (danhDeContract) {
            try {
                multiplier = (await danhDeContract.payoutMultiplier()).toNumber();
            } catch (e) {}
        }

        const potentialWin = amount * multiplier;
        potentialWinEl.textContent = formatToken(
            ethers.utils.parseUnits(potentialWin.toString(), tokenInfo.decimals),
            tokenInfo.decimals,
            tokenInfo.symbol
        );
    } else {
        betAmountDisplayEl.textContent = '-- VND';
        potentialWinEl.textContent = '-- VND';
    }

    // Enable/disable place bet button
    placeBetBtn.disabled = !(
        selectedNumber !== null &&
        selectedToken &&
        amount > 0 &&
        userAddress &&
        currentRound &&
        Math.floor(Date.now() / 1000) < currentRound.endTime
    );
}

// Place bet
async function placeBet() {
    if (!danhDeContract || !userAddress) return;

    const amount = parseFloat(betAmountInput.value);
    const tokenInfo = Object.values(DANHDE_CONFIG.TOKENS).find(t => t.address === selectedToken);

    if (!tokenInfo || selectedNumber === null || amount <= 0) {
        showToast('Please fill all fields', 'error');
        return;
    }

    try {
        placeBetBtn.disabled = true;
        placeBetBtn.innerHTML = '<span class="spinner"></span> Processing...';

        const amountWei = ethers.utils.parseUnits(amount.toString(), tokenInfo.decimals);

        // Check allowance
        const tokenContract = new ethers.Contract(selectedToken, DANHDE_CONFIG.ERC20_ABI, signer);
        const allowance = await tokenContract.allowance(userAddress, DANHDE_CONFIG.DANHDE_ADDRESS);

        if (allowance.lt(amountWei)) {
            showToast('Approving tokens...', 'info');
            const approveTx = await tokenContract.approve(DANHDE_CONFIG.DANHDE_ADDRESS, ethers.constants.MaxUint256);
            await approveTx.wait();
            showToast('Tokens approved!', 'success');
        }

        // Place bet
        showToast('Placing bet...', 'info');
        const tx = await danhDeContract.placeBet(selectedToken, amountWei, selectedNumber);
        await tx.wait();

        showToast(`Bet placed on ${selectedNumber.toString().padStart(2, '0')}!`, 'success');

        // Reset form
        betAmountInput.value = '';
        selectedNumber = null;
        document.querySelectorAll('.number-btn').forEach(btn => btn.classList.remove('selected'));
        updateBetSummary();

        // Reload data
        await loadRoundInfo();
        await loadBets('active');
        await updateBalance();

    } catch (error) {
        console.error('Bet failed:', error);
        showToast(error.reason || 'Transaction failed', 'error');
    } finally {
        placeBetBtn.disabled = false;
        placeBetBtn.innerHTML = 'Place Bet';
    }
}

// Load bets
async function loadBets(tab) {
    if (!danhDeContract || !userAddress) {
        betsList.innerHTML = `
            <div class="empty-state">
                <span>🎫</span>
                <p>Connect wallet to see your bets</p>
            </div>
        `;
        return;
    }

    try {
        const betIds = await danhDeContract.getPlayerBetIds(userAddress);

        if (betIds.length === 0) {
            betsList.innerHTML = `
                <div class="empty-state">
                    <span>🎫</span>
                    <p>No bets yet. Place your first bet!</p>
                </div>
            `;
            return;
        }

        betsList.innerHTML = '';

        // Load bets in reverse order (newest first)
        for (let i = betIds.length - 1; i >= 0; i--) {
            const betId = betIds[i];
            const bet = await danhDeContract.bets(betId);
            const round = await danhDeContract.rounds(bet.roundId);

            const tokenInfo = Object.values(DANHDE_CONFIG.TOKENS).find(t =>
                t.address.toLowerCase() === bet.token.toLowerCase()
            );

            const isActive = round.resultTime.toNumber() === 0 && !round.cancelled;
            const isWinner = round.resultTime.toNumber() > 0 && bet.number === round.winningNumber;

            // Filter based on tab
            if (tab === 'active' && !isActive) continue;
            if (tab === 'history' && isActive) continue;

            const betItem = document.createElement('div');
            betItem.className = 'bet-item';

            let statusHtml = '';
            if (bet.claimed) {
                statusHtml = '<span class="status-badge claimed">Claimed</span>';
            } else if (round.cancelled) {
                statusHtml = `<button class="claim-btn" onclick="claimRefund(${betId})">Refund</button>`;
            } else if (isWinner) {
                statusHtml = `<button class="claim-btn" onclick="claimWinnings(${betId})">Claim ${(await danhDeContract.payoutMultiplier()).toNumber()}x</button>`;
            } else if (round.resultTime.toNumber() > 0) {
                statusHtml = '<span class="status-badge lost">Lost</span>';
            } else {
                statusHtml = '<span class="status-badge pending">Pending</span>';
            }

            betItem.innerHTML = `
                <div class="bet-number">${bet.number.toString().padStart(2, '0')}</div>
                <div class="bet-details">
                    <div class="bet-round">Round #${bet.roundId}</div>
                    <div class="bet-token">${tokenInfo?.symbol || 'Unknown'}</div>
                </div>
                <div class="bet-amount">${formatToken(bet.amount, tokenInfo?.decimals || 18, tokenInfo?.symbol || '')}</div>
                <div class="bet-potential">
                    Win: <strong>${formatToken(bet.amount.mul(await danhDeContract.payoutMultiplier()), tokenInfo?.decimals || 18, tokenInfo?.symbol || '')}</strong>
                </div>
                <div class="bet-status">${statusHtml}</div>
            `;

            betsList.appendChild(betItem);
        }

        if (betsList.children.length === 0) {
            betsList.innerHTML = `
                <div class="empty-state">
                    <span>🎫</span>
                    <p>No ${tab} bets</p>
                </div>
            `;
        }

    } catch (error) {
        console.error('Failed to load bets:', error);
        betsList.innerHTML = `
            <div class="empty-state">
                <span>⚠️</span>
                <p>Failed to load bets</p>
            </div>
        `;
    }
}

// Claim winnings
async function claimWinnings(betId) {
    if (!danhDeContract) return;

    try {
        showToast('Claiming winnings...', 'info');
        const tx = await danhDeContract.claimWinnings(betId);
        await tx.wait();
        showToast('Winnings claimed!', 'success');
        await loadBets('active');
        await updateBalance();
    } catch (error) {
        console.error('Claim failed:', error);
        showToast(error.reason || 'Claim failed', 'error');
    }
}

// Claim refund
async function claimRefund(betId) {
    if (!danhDeContract) return;

    try {
        showToast('Claiming refund...', 'info');
        const tx = await danhDeContract.claimRefund(betId);
        await tx.wait();
        showToast('Refund claimed!', 'success');
        await loadBets('active');
        await updateBalance();
    } catch (error) {
        console.error('Refund failed:', error);
        showToast(error.reason || 'Refund failed', 'error');
    }
}

// Load past results
async function loadPastResults() {
    if (!danhDeContract) return;

    try {
        resultsGrid.innerHTML = '';

        const currentId = (await danhDeContract.currentRoundId()).toNumber();

        // Load last 10 completed rounds
        for (let i = currentId - 1; i >= Math.max(1, currentId - 10); i--) {
            const round = await danhDeContract.rounds(i);

            if (round.resultTime.toNumber() === 0) continue;

            const resultCard = document.createElement('div');
            resultCard.className = 'result-card';
            resultCard.innerHTML = `
                <div class="result-round">Round #${i}</div>
                <div class="result-number">${round.winningNumber.toString().padStart(2, '0')}</div>
                <div class="result-date">${formatDate(round.resultTime.toNumber())}</div>
            `;

            resultsGrid.appendChild(resultCard);
        }

        if (resultsGrid.children.length === 0) {
            resultsGrid.innerHTML = '<div class="empty-state"><p>No results yet</p></div>';
        }

    } catch (error) {
        console.error('Failed to load results:', error);
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Make functions globally accessible
window.claimWinnings = claimWinnings;
window.claimRefund = claimRefund;
