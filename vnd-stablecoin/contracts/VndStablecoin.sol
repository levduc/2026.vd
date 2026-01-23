// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VndStablecoin is ERC20, ERC20Pausable, Ownable {
    mapping(address => bool) public blacklisted;
    
    event Blacklisted(address indexed account);
    event UnBlacklisted(address indexed account);
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);

    constructor() ERC20("VND Stablecoin", "vnd") Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
        emit Mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
        emit Burn(from, amount);
    }

    function blacklist(address account) external onlyOwner {
        blacklisted[account] = true;
        emit Blacklisted(account);
    }

    function removeBlacklist(address account) external onlyOwner {
        blacklisted[account] = false;
        emit UnBlacklisted(account);
    }

    function _update(address from, address to, uint256 value) 
        internal 
        override(ERC20, ERC20Pausable) 
    {
        require(!blacklisted[from], "Sender blacklisted");
        require(!blacklisted[to], "Recipient blacklisted");
        super._update(from, to, value);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
