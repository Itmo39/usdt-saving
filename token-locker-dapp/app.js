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
            await depositTx.wait();

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
            const withdrawTx = await tokenLockerContract.withdraw();
            await withdrawTx.wait();
            alert('Withdrawal successful!');
            await updateUserInfo();
        } catch (error) {
            console.error("Withdrawal failed:", error);
            alert('Withdrawal failed. See console for details.');
        }
    });

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
            }
        });
    }
}); 