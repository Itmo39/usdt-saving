window.addEventListener('load', async () => {
    // --- DOM Elements ---
    const connectWalletBtn = document.getElementById('connectWalletBtn');
    const appDiv = document.getElementById('app');
    const statusEl = document.getElementById('status');
    const userAddressEl = document.getElementById('userAddress');
    const lockedBalanceEl = document.getElementById('lockedBalance');
    const unlockDateEl = document.getElementById('unlockDate');
    const depositAmountInput = document.getElementById('depositAmount');
    const unlockTimestampInput = document.getElementById('unlockTimestamp');
    const unlockDatePickerDiv = document.getElementById('unlockDatePicker');
    const depositBtn = document.getElementById('depositBtn');
    const depositHelperEl = document.getElementById('depositHelper');
    const withdrawBtn = document.getElementById('withdrawBtn');
    const transactionHistoryEl = document.getElementById('transactionHistory');
    const historyLoadingEl = document.getElementById('historyLoading');
    const historyEmptyEl = document.getElementById('historyEmpty');
    const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');

    // --- Contract Details (NEEDS TO BE FILLED) ---
    // TODO: Replace with your deployed contract address
    const contractAddress = '0x32Ed0eC795067c755390e0F6D76d4aC202659661'; 
    // TODO: The ABI can be found in your compiled contract artifacts
    const contractABI = [
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "_unlockTimestamp",
				"type": "uint256"
			}
		],
		"name": "deposit",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_usdtAddress",
				"type": "address"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [],
		"name": "withdraw",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "balances",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_user",
				"type": "address"
			}
		],
		"name": "getUserInfo",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "balance",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "unlockTime",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "unlockTimes",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "usdtToken",
		"outputs": [
			{
				"internalType": "contract IERC20",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
];
    // The ABI for the standard ERC20 `approve` function
    const erc20Abi = [
        "function approve(address spender, uint256 amount) external returns (bool)"
    ];

    // --- State ---
    let provider;
    let signer;
    let userAddress;
    let tokenLockerContract;
    let usdtContractAddress;
    let transactionHistory = [];

    // --- Connect Wallet ---
    connectWalletBtn.addEventListener('click', async () => {
        if (typeof window.ethereum === 'undefined') {
            alert('MetaMask is not installed. Please install it to use this app.');
            return;
        }

        try {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = provider.getSigner();
            userAddress = await signer.getAddress();
            
            tokenLockerContract = new ethers.Contract(contractAddress, contractABI, signer);
            usdtContractAddress = await tokenLockerContract.usdtToken();

            // --- UI Updates on Connection ---
            statusEl.textContent = 'Connected';
            userAddressEl.textContent = userAddress;
            connectWalletBtn.classList.add('hidden');
            appDiv.classList.remove('hidden');

            await updateUserInfo();
            await loadTransactionHistory();
        } catch (error) {
            console.error("Failed to connect wallet:", error);
            alert('Failed to connect wallet. See console for details.');
        }
    });

    // --- Update User Info Display ---
    async function updateUserInfo() {
        if (!tokenLockerContract || !userAddress) return;

        try {
            const [balance, unlockTime] = await tokenLockerContract.getUserInfo(userAddress);
            const formattedBalance = ethers.utils.formatUnits(balance, 18); // Assuming USDT has 18 decimals
            lockedBalanceEl.textContent = formattedBalance;

            if (unlockTime.isZero()) {
                unlockDateEl.textContent = 'Not set';
                unlockDatePickerDiv.classList.remove('hidden'); // Show date picker
                withdrawBtn.disabled = true;
            } else {
                const unlockDate = new Date(unlockTime.toNumber() * 1000);
                unlockDateEl.textContent = unlockDate.toLocaleString();
                unlockDatePickerDiv.classList.add('hidden'); // Hide date picker
                // Enable withdraw button only if the time has passed
                withdrawBtn.disabled = Date.now() < unlockDate.getTime();
            }
        } catch (error) {
            console.error("Could not get user info:", error);
        }
    }

    // --- Deposit ---
    depositBtn.addEventListener('click', async () => {
        const amountStr = depositAmountInput.value;
        if (!amountStr || parseFloat(amountStr) <= 0) {
            alert('Please enter a valid amount.');
            return;
        }

        const amount = ethers.utils.parseUnits(amountStr, 18); // 18 decimals for USDT

        try {
            const usdtContract = new ethers.Contract(usdtContractAddress, erc20Abi, signer);

            // Step 1: Approve the contract to spend USDT
            depositHelperEl.classList.remove('hidden');
            const approveTx = await usdtContract.approve(contractAddress, amount);
            await approveTx.wait(); // Wait for approval to be mined
            
            // Step 2: Call the deposit function
            let unlockTimestamp = 0;
            const existingUnlockTime = (await tokenLockerContract.getUserInfo(userAddress)).unlockTime;
            
            if (existingUnlockTime.isZero()) {
                const dateStr = unlockTimestampInput.value;
                if (!dateStr) {
                    alert('Please select an unlock date for your first deposit.');
                    depositHelperEl.classList.add('hidden');
                    return;
                }
                
                // Create a timestamp for the END of the selected day in UTC.
                // This prevents issues where selecting "today" would result in a timestamp in the past.
                const parts = dateStr.split('-'); // YYYY-MM-DD
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
                const day = parseInt(parts[2], 10);
                
                const endOfDayUTC = Date.UTC(year, month, day, 23, 59, 59);
                unlockTimestamp = Math.floor(endOfDayUTC / 1000);
            }

            const depositTx = await tokenLockerContract.deposit(amount, unlockTimestamp);
            const receipt = await depositTx.wait();

            // Add to transaction history
            await addTransactionToHistory({
                type: 'deposit',
                amount: amountStr,
                txHash: receipt.transactionHash,
                timestamp: Date.now(),
                blockNumber: receipt.blockNumber
            });

            alert('Deposit successful!');
            depositHelperEl.classList.add('hidden');
            depositAmountInput.value = '';
            await updateUserInfo();

        } catch (error) {
            console.error("Deposit failed:", error);
            alert('Deposit failed. See console for details.');
            depositHelperEl.classList.add('hidden');
        }
    });

    // --- Withdraw ---
    withdrawBtn.addEventListener('click', async () => {
        try {
            // Get balance before withdrawal
            const userInfoBefore = await tokenLockerContract.getUserInfo(userAddress);
            const withdrawAmount = ethers.utils.formatUnits(userInfoBefore.balance, 18);

            const withdrawTx = await tokenLockerContract.withdraw();
            const receipt = await withdrawTx.wait();

            // Add to transaction history
            await addTransactionToHistory({
                type: 'withdraw',
                amount: withdrawAmount,
                txHash: receipt.transactionHash,
                timestamp: Date.now(),
                blockNumber: receipt.blockNumber
            });

            alert('Withdrawal successful!');
            await updateUserInfo();
        } catch (error) {
            console.error("Withdrawal failed:", error);
            alert('Withdrawal failed. See console for details.');
        }
    });

    // Refresh transaction history button
    if (refreshHistoryBtn) {
        refreshHistoryBtn.addEventListener('click', async () => {
            if (!userAddress) {
                alert('Please connect your wallet first');
                return;
            }
            refreshHistoryBtn.disabled = true;
            refreshHistoryBtn.textContent = 'Refreshing...';
            try {
                await loadTransactionHistory();
            } catch (error) {
                console.error('Error refreshing history:', error);
                alert('Error refreshing history. Check console for details.');
            } finally {
                refreshHistoryBtn.disabled = false;
                refreshHistoryBtn.textContent = 'Refresh';
            }
        });
    }

    // Handle wallet account changes
    if (typeof window.ethereum !== 'undefined') {
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                // Wallet disconnected
                statusEl.textContent = 'Not Connected';
                userAddressEl.textContent = '';
                connectWalletBtn.classList.remove('hidden');
                appDiv.classList.add('hidden');
            } else {
                // Switched accounts
                userAddress = accounts[0];
                statusEl.textContent = 'Connected';
                userAddressEl.textContent = userAddress;
                updateUserInfo();
                loadTransactionHistory();
            }
        });
    }

    // --- Transaction History Functions ---
    
    // Get storage key for current user
    function getStorageKey() {
        return `txHistory_${userAddress?.toLowerCase()}`;
    }

    // Load transaction history from localStorage and blockchain
    async function loadTransactionHistory() {
        if (!userAddress || !provider) return;

        try {
            historyLoadingEl.classList.remove('hidden');
            historyLoadingEl.textContent = 'Loading transaction history...';
            historyEmptyEl.classList.add('hidden');
            transactionHistoryEl.innerHTML = '';

            // Load from localStorage first
            const storageKey = getStorageKey();
            const storedHistory = localStorage.getItem(storageKey);
            if (storedHistory) {
                transactionHistory = JSON.parse(storedHistory);
                console.log(`Loaded ${transactionHistory.length} transactions from localStorage`);
            } else {
                transactionHistory = [];
                console.log('No stored transactions found in localStorage');
            }

            // Display history from localStorage first
            displayTransactionHistory();

            // Fetch transactions from blockchain
            historyLoadingEl.textContent = 'Fetching transactions from blockchain...';
            await fetchBlockchainTransactions();
            
            // Sort by timestamp (newest first)
            transactionHistory.sort((a, b) => b.timestamp - a.timestamp);
            
            // Save updated history
            localStorage.setItem(storageKey, JSON.stringify(transactionHistory));
            
            // Update display
            displayTransactionHistory();
            historyLoadingEl.classList.add('hidden');
            
            console.log(`Total transactions after fetch: ${transactionHistory.length}`);
        } catch (error) {
            console.error("Error loading transaction history:", error);
            historyLoadingEl.textContent = 'Error loading history. Showing cached transactions.';
            historyLoadingEl.classList.add('hidden');
            // Still show what we have from localStorage
            displayTransactionHistory();
        }
    }

    // Fetch transactions from blockchain using BSCScan API (more efficient)
    async function fetchBlockchainTransactions() {
        if (!userAddress || !provider || !tokenLockerContract) {
            console.warn('Cannot fetch transactions: missing userAddress, provider, or contract');
            return;
        }

        try {
            console.log(`Fetching all transactions for wallet: ${userAddress}`);
            console.log(`Contract address: ${contractAddress}`);
            
            // Method 1: Try using BSCScan API (no API key needed for reasonable usage)
            try {
                const bscScanResult = await fetchTransactionsFromBSCScan();
                if (bscScanResult && bscScanResult.length > 0) {
                    console.log(`Successfully fetched ${bscScanResult.length} transactions from BSCScan`);
                    return;
                } else {
                    console.log('BSCScan returned no transactions, trying blockchain fallback...');
                    throw new Error('No transactions from BSCScan');
                }
            } catch (bscScanError) {
                console.warn("BSCScan API failed, trying direct blockchain query:", bscScanError);
                // Fallback to direct blockchain query
                await fetchTransactionsFromBlockchain();
            }
        } catch (error) {
            console.error("Error fetching blockchain transactions:", error);
            throw error; // Re-throw so caller knows it failed
        }
    }

    // Fetch transactions using BSCScan API
    async function fetchTransactionsFromBSCScan() {
        const bscScanUrl = 'https://api.bscscan.com/api';
        const userTxs = [];

        // Get all transactions from wallet to contract
        // BSCScan API allows reasonable usage without API key
        const params = new URLSearchParams({
            module: 'account',
            action: 'txlist',
            address: userAddress,
            startblock: '0',
            endblock: '99999999',
            sort: 'desc',
            page: '1',
            offset: '10000' // Get up to 10k transactions
        });

        console.log(`Calling BSCScan API for address: ${userAddress}`);
        console.log(`API URL: ${bscScanUrl}?${params.toString()}`);
        
        let response;
        try {
            response = await fetch(`${bscScanUrl}?${params}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
        } catch (fetchError) {
            console.error('Fetch error (might be CORS):', fetchError);
            throw new Error(`Failed to fetch from BSCScan API: ${fetchError.message}. This might be a CORS issue.`);
        }
        
        if (!response.ok) {
            throw new Error(`BSCScan API HTTP error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('BSCScan API response status:', data.status);
        console.log('BSCScan API response message:', data.message);
        if (data.result && Array.isArray(data.result)) {
            console.log(`BSCScan returned ${data.result.length} transactions`);
        }

        if (data.status === '1' && data.result && Array.isArray(data.result)) {
            console.log(`BSCScan returned ${data.result.length} total transactions`);
            const iface = new ethers.utils.Interface(contractABI);
            
            let processedCount = 0;
            for (const tx of data.result) {
                // Only process transactions to our contract
                if (tx.to && tx.to.toLowerCase() === contractAddress.toLowerCase() && tx.isError === '0') {
                    const txExists = transactionHistory.find(t => t.txHash && t.txHash.toLowerCase() === tx.hash.toLowerCase());
                    if (!txExists) {
                        try {
                            // Check if transaction has input data (function call)
                            if (!tx.input || tx.input === '0x' || tx.input.length < 10) {
                                console.debug(`Skipping transaction ${tx.hash}: no input data`);
                                continue;
                            }

                            // Try to decode the transaction
                            const decoded = iface.parseTransaction({ data: tx.input, value: tx.value });
                            
                            if (decoded && decoded.name === 'deposit') {
                                const amount = ethers.utils.formatUnits(decoded.args[0], 18);
                                userTxs.push({
                                    type: 'deposit',
                                    amount: amount,
                                    txHash: tx.hash,
                                    timestamp: parseInt(tx.timeStamp) * 1000,
                                    blockNumber: parseInt(tx.blockNumber)
                                });
                                processedCount++;
                                console.log(`Found deposit: ${amount} USDT at ${tx.hash}`);
                            } else if (decoded && decoded.name === 'withdraw') {
                                // For withdrawals, try to get amount from transaction value or estimate
                                // The actual withdrawal amount is the balance before withdrawal
                                // We'll mark it and try to get the amount from Transfer events
                                userTxs.push({
                                    type: 'withdraw',
                                    amount: 'Calculating...', // Will be updated
                                    txHash: tx.hash,
                                    timestamp: parseInt(tx.timeStamp) * 1000,
                                    blockNumber: parseInt(tx.blockNumber)
                                });
                                processedCount++;
                                console.log(`Found withdrawal at ${tx.hash}`);
                            }
                        } catch (e) {
                            // Couldn't decode, might not be a deposit/withdraw call
                            console.debug(`Could not decode transaction ${tx.hash}:`, e.message);
                        }
                    } else {
                        console.debug(`Transaction ${tx.hash} already exists in history`);
                    }
                }
            }

            console.log(`Processed ${processedCount} new transactions from ${data.result.length} total transactions`);

            // For withdrawals, try to get the actual amount from Transfer events
            if (userTxs.length > 0) {
                console.log('Enriching withdrawal amounts...');
                await enrichWithdrawalAmounts(userTxs);
            }

            // Add new transactions to history
            for (const tx of userTxs) {
                const exists = transactionHistory.find(t => t.txHash && t.txHash.toLowerCase() === tx.txHash.toLowerCase());
                if (!exists) {
                    transactionHistory.push(tx);
                }
            }

            console.log(`Added ${userTxs.length} new transactions from BSCScan`);
            return userTxs;
        } else if (data.status === '0') {
            // API returned an error (might be rate limited or invalid address)
            const errorMsg = data.message || data.result || 'Unknown BSCScan API error';
            console.warn('BSCScan API error:', errorMsg);
            throw new Error(errorMsg);
        } else {
            // No transactions found or unexpected response
            console.log('No transactions found from BSCScan. Response:', data);
            return [];
        }
    }

    // Enrich withdrawal amounts by checking Transfer events
    async function enrichWithdrawalAmounts(userTxs) {
        if (!usdtContractAddress || !provider) return;

        const erc20Abi = [
            "event Transfer(address indexed from, address indexed to, uint256 value)"
        ];
        const iface = new ethers.utils.Interface(erc20Abi);
        const transferEventTopic = ethers.utils.id("Transfer(address,address,uint256)");

        for (const tx of userTxs) {
            if (tx.type === 'withdraw' && (tx.amount === 'Calculating...' || tx.amount === 'Unknown')) {
                try {
                    // Get Transfer events from the withdrawal transaction
                    const receipt = await provider.getTransactionReceipt(tx.txHash);
                    if (receipt && receipt.logs) {
                        for (const log of receipt.logs) {
                            // Check if this is a Transfer event from the USDT contract
                            if (log.address.toLowerCase() === usdtContractAddress.toLowerCase() &&
                                log.topics[0] === transferEventTopic) {
                                try {
                                    const parsedLog = iface.parseLog(log);
                                    if (parsedLog && parsedLog.name === 'Transfer') {
                                        // Check if it's a transfer FROM contract TO user
                                        // topics[1] is from, topics[2] is to (both are indexed)
                                        const fromAddress = ethers.utils.getAddress('0x' + log.topics[1].slice(26));
                                        const toAddress = ethers.utils.getAddress('0x' + log.topics[2].slice(26));
                                        
                                        if (fromAddress.toLowerCase() === contractAddress.toLowerCase() &&
                                            toAddress.toLowerCase() === userAddress.toLowerCase()) {
                                            tx.amount = ethers.utils.formatUnits(parsedLog.args.value, 18);
                                            break;
                                        }
                                    }
                                } catch (e) {
                                    // Try alternative parsing method
                                    try {
                                        // Extract value from data (last 32 bytes for uint256)
                                        const valueHex = '0x' + log.data.slice(-64);
                                        const value = ethers.BigNumber.from(valueHex);
                                        const fromAddress = ethers.utils.getAddress('0x' + log.topics[1].slice(26));
                                        const toAddress = ethers.utils.getAddress('0x' + log.topics[2].slice(26));
                                        
                                        if (fromAddress.toLowerCase() === contractAddress.toLowerCase() &&
                                            toAddress.toLowerCase() === userAddress.toLowerCase()) {
                                            tx.amount = ethers.utils.formatUnits(value, 18);
                                            break;
                                        }
                                    } catch (e2) {
                                        // Couldn't parse, continue
                                    }
                                }
                            }
                        }
                    }
                    
                    // If still not found, mark as unknown
                    if (tx.amount === 'Calculating...' || tx.amount === 'Unknown') {
                        tx.amount = 'Unknown';
                    }
                } catch (e) {
                    tx.amount = 'Unknown';
                }
            }
        }
    }

    // Fallback: Fetch transactions directly from blockchain (slower but works without API)
    async function fetchTransactionsFromBlockchain() {
        console.log('Starting blockchain scan fallback...');
        const currentBlock = await provider.getBlockNumber();
        console.log(`Current block: ${currentBlock}`);
        
        // Try to get contract creation block, or look back a reasonable amount
        // BSC has ~3 second block time, so 100k blocks ≈ 3-4 days
        // We'll scan the last 100k blocks in batches
        const scanRange = 100000; // Scan last 100k blocks
        const fromBlock = Math.max(0, currentBlock - scanRange);
        console.log(`Scanning blocks ${fromBlock} to ${currentBlock} (${scanRange} blocks)`);
        
        const iface = new ethers.utils.Interface(contractABI);
        const depositSig = iface.getSighash('deposit');
        const withdrawSig = iface.getSighash('withdraw');
        
        const userTxs = [];
        const batchSize = 1000; // Process 1000 blocks at a time
        
        console.log(`Scanning blocks ${fromBlock} to ${currentBlock}...`);
        
        for (let startBlock = fromBlock; startBlock <= currentBlock; startBlock += batchSize) {
            const endBlock = Math.min(startBlock + batchSize - 1, currentBlock);
            
            try {
                // Use filter to get transactions more efficiently
                const filter = {
                    fromBlock: startBlock,
                    toBlock: endBlock,
                    to: contractAddress
                };
                
                // Get transaction receipts for this range
                // Note: This is still somewhat slow, but better than scanning each block
                for (let blockNum = startBlock; blockNum <= endBlock && blockNum <= currentBlock; blockNum += 100) {
                    try {
                        const block = await provider.getBlockWithTransactions(blockNum);
                        
                        for (const tx of block.transactions) {
                            if (tx.from && 
                                tx.from.toLowerCase() === userAddress.toLowerCase() &&
                                tx.to && 
                                tx.to.toLowerCase() === contractAddress.toLowerCase() &&
                                tx.data && 
                                (tx.data.startsWith(depositSig) || tx.data.startsWith(withdrawSig))) {
                                
                                const txExists = transactionHistory.find(t => t.txHash === tx.hash);
                                if (!txExists) {
                                    try {
                                        const receipt = await provider.getTransactionReceipt(tx.hash);
                                        if (receipt && receipt.status === 1) {
                                            const decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
                                            
                                            if (decoded.name === 'deposit') {
                                                const amount = ethers.utils.formatUnits(decoded.args[0], 18);
                                                userTxs.push({
                                                    type: 'deposit',
                                                    amount: amount,
                                                    txHash: tx.hash,
                                                    timestamp: block.timestamp * 1000,
                                                    blockNumber: receipt.blockNumber
                                                });
                                            } else if (decoded.name === 'withdraw') {
                                                userTxs.push({
                                                    type: 'withdraw',
                                                    amount: 'Unknown',
                                                    txHash: tx.hash,
                                                    timestamp: block.timestamp * 1000,
                                                    blockNumber: receipt.blockNumber
                                                });
                                            }
                                        }
                                    } catch (e) {
                                        // Skip this transaction
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Continue with next batch
                    }
                }
            } catch (e) {
                console.warn(`Error processing blocks ${startBlock}-${endBlock}:`, e);
            }
        }

        // Enrich withdrawal amounts
        await enrichWithdrawalAmounts(userTxs);

        // Add new transactions to history
        for (const tx of userTxs) {
            const exists = transactionHistory.find(t => t.txHash === tx.txHash);
            if (!exists) {
                transactionHistory.push(tx);
            }
        }

        console.log(`Found ${userTxs.length} new transactions from blockchain scan`);
    }

    // Add a new transaction to history
    async function addTransactionToHistory(tx) {
        const storageKey = getStorageKey();
        transactionHistory.unshift(tx); // Add to beginning
        transactionHistory.sort((a, b) => b.timestamp - a.timestamp);
        localStorage.setItem(storageKey, JSON.stringify(transactionHistory));
        displayTransactionHistory();
    }

    // Display transaction history in UI
    function displayTransactionHistory() {
        historyLoadingEl.classList.add('hidden');
        
        if (transactionHistory.length === 0) {
            historyEmptyEl.classList.remove('hidden');
            transactionHistoryEl.innerHTML = '';
            return;
        }

        historyEmptyEl.classList.add('hidden');
        
        // Determine blockchain explorer URL (BSC)
        const explorerUrl = 'https://bscscan.com/tx/';
        
        transactionHistoryEl.innerHTML = transactionHistory.map(tx => {
            const date = new Date(tx.timestamp);
            const formattedDate = date.toLocaleString();
            const typeClass = tx.type === 'deposit' ? 'deposit' : 'withdraw';
            const typeLabel = tx.type === 'deposit' ? 'Deposit' : 'Withdraw';
            
            return `
                <div class="transaction-item">
                    <div class="transaction-header">
                        <span class="transaction-type ${typeClass}">${typeLabel}</span>
                        <span class="transaction-date">${formattedDate}</span>
                    </div>
                    <div class="transaction-details">
                        <p><strong>Amount:</strong> ${tx.amount} USDT</p>
                        <p><strong>Block:</strong> ${tx.blockNumber}</p>
                        <p class="transaction-hash" style="grid-column: 1 / -1;">
                            <strong>Tx Hash:</strong> 
                            <a href="${explorerUrl}${tx.txHash}" target="_blank" rel="noopener noreferrer">
                                ${tx.txHash}
                            </a>
                        </p>
                    </div>
                </div>
            `;
        }).join('');
    }
}); 