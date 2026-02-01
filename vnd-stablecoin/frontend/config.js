const CONFIG = {
    // Replace with your deployed contract address
    VND_EXCHANGE_ADDRESS: "0x0000000000000000000000000000000000000000",

    // ABI for VndExchange (Minified for key functions)
    VND_EXCHANGE_ABI: [
        "function setRates(uint256 _buyVndRate, uint256 _sellVndRate) external",
        "function vndPerUsdToBuyVnd() view returns (uint256)",
        "function vndPerUsdToSellVnd() view returns (uint256)",
        "function hasRole(bytes32 role, address account) view returns (bool)",
        "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
        "function withdraw(address token, uint256 amount) external",
        "function setSupportedToken(address token, bool isSupported) external",
        "event RatesUpdated(uint256 buyVndRate, uint256 sellVndRate)"
    ]
};
