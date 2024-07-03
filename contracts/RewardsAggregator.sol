// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@threshold-network/solidity-contracts/contracts/staking/IApplication.sol";

import "./interfaces/IRewardsAggregator.sol";

/**
 * @title Rewards Aggregator
 * @notice RewardsAggregator is the contract responsible for the distribution
 *         of the Threshold Network staking rewards. The rewards are generated
 *         by two different sources: a Merkle tree distribution and the Threshold
 *         Network applications.
 */
contract RewardsAggregator is Ownable, IRewardsAggregator {
    using SafeERC20 for IERC20;
    using MerkleProof for bytes32[];

    address public immutable override token;
    address public rewardsHolder;

    bytes32 public override merkleRoot;
    mapping(address => uint256) internal cumulativeClaimed;

    // TODO: Generalize to an array of IApplication in the future.
    // For the moment, it will only be used for TACo app.
    IApplication public immutable application;

    IRewardsAggregator public immutable oldRewardsAggregator;

    struct MerkleClaim {
        address stakingProvider;
        address beneficiary;
        uint256 amount;
        bytes32[] proof;
    }

    constructor(
        address token_,
        IApplication application_,
        IRewardsAggregator _oldRewardsAggregator,
        address rewardsHolder_,
        address newOwner
    ) {
        require(IERC20(token_).totalSupply() > 0, "Token contract must be set");
        require(
            rewardsHolder_ != address(0),
            "Rewards Holder must be an address"
        );
        require(
            address(application_) != address(0),
            "Application must be an address"
        );
        require(
            token_ == _oldRewardsAggregator.token(),
            "Incompatible old RewardsAggregator"
        );

        transferOwnership(newOwner);
        token = token_;
        application = application_;
        rewardsHolder = rewardsHolder_;
        oldRewardsAggregator = _oldRewardsAggregator;
    }

    function setMerkleRoot(bytes32 merkleRoot_) external override onlyOwner {
        emit MerkleRootUpdated(merkleRoot, merkleRoot_);
        merkleRoot = merkleRoot_;
    }

    function setRewardsHolder(address rewardsHolder_) external onlyOwner {
        require(
            rewardsHolder_ != address(0),
            "Rewards holder must be an address"
        );
        emit RewardsHolderUpdated(rewardsHolder, rewardsHolder_);
        rewardsHolder = rewardsHolder_;
    }

    /**
     * @notice Returns the amount of rewards that a given stake has already
     *         claimed from the Merkle distribution, including the old Merkle
     *         distribution contract. The returned amount does not include the
     *         claimed rewards generated by the applications.
     */
    function cumulativeMerkleClaimed(
        address stakingProvider
    ) public view returns (uint256) {
        uint256 newAmount = cumulativeClaimed[stakingProvider];
        if (newAmount > 0) {
            return newAmount;
        } else {
            return
                oldRewardsAggregator.cumulativeMerkleClaimed(stakingProvider);
        }
    }

    /**
     * @notice Claim the rewards that have been generated by the Merkle
     *         distribution mechanism.
     */
    function claimMerkle(
        address stakingProvider,
        address beneficiary,
        uint256 cumulativeAmount,
        bytes32 expectedMerkleRoot,
        bytes32[] calldata merkleProof
    ) public {
        require(merkleRoot == expectedMerkleRoot, "Merkle root was updated");

        // Verify the merkle proof
        bytes32 leaf = keccak256(
            abi.encodePacked(stakingProvider, beneficiary, cumulativeAmount)
        );
        require(
            verifyMerkleProof(merkleProof, expectedMerkleRoot, leaf),
            "Invalid proof"
        );

        // Mark it claimed (potentially taking into consideration state in old
        // MerkleDistribution contract)
        uint256 preclaimed = cumulativeMerkleClaimed(stakingProvider);
        require(preclaimed < cumulativeAmount, "Nothing to claim");
        cumulativeClaimed[stakingProvider] = cumulativeAmount;

        // Send the tokens
        unchecked {
            uint256 amount = cumulativeAmount - preclaimed;
            IERC20(token).safeTransferFrom(rewardsHolder, beneficiary, amount);
            emit MerkleClaimed(
                stakingProvider,
                amount,
                beneficiary,
                expectedMerkleRoot
            );
        }
    }

    /**
     * @notice Check if a particular stake has available rewards to claim.
     */
    function canClaimApps(address stakingProvider) public view returns (bool) {
        return application.availableRewards(stakingProvider) > 0;
    }

    /**
     * @notice Claim the rewards generated by the Threshold Network
     *         applications.
     */
    function claimApps(address stakingProvider) public {
        application.withdrawRewards(stakingProvider);
    }

    /**
     * @notice Claim the rewards generated by both the Merkle distributions
     *         and the Threshold Network applications.
     */
    function claim(
        address stakingProvider,
        address beneficiary,
        uint256 cumulativeAmount,
        bytes32 expectedMerkleRoot,
        bytes32[] calldata merkleProof
    ) public {
        if (
            cumulativeAmount != 0 &&
            expectedMerkleRoot != bytes32(0) &&
            merkleProof.length != 0
        ) {
            claimMerkle(
                stakingProvider,
                beneficiary,
                cumulativeAmount,
                expectedMerkleRoot,
                merkleProof
            );
        }
        if (canClaimApps(stakingProvider)) {
            claimApps(stakingProvider);
        }
    }

    /**
     * @notice Claim the rewards generated by the Threshold Network
     *         applications.
     */
    function claim(address stakingProvider) public {
        claimApps(stakingProvider);
    }

    /**
     * @notice Claim a batch of rewards generated by the Merkle distributions.
     */
    function batchClaimMerkle(
        bytes32 expectedMerkleRoot,
        MerkleClaim[] calldata Claims
    ) external {
        for (uint i; i < Claims.length; i++) {
            claimMerkle(
                Claims[i].stakingProvider,
                Claims[i].beneficiary,
                Claims[i].amount,
                expectedMerkleRoot,
                Claims[i].proof
            );
        }
    }

    /**
     * @notice Claim a batch of rewards generated by the Threshold Network
     *         applications.
     */
    function batchClaimApps(address[] calldata stakingProviders) external {
        for (uint i; i < stakingProviders.length; i++) {
            claimApps(stakingProviders[i]);
        }
    }

    /**
     * @notice Claim a batch of rewards generated by both the Merkle
     *         distribution and the Threshold Network applications.
     */
    function batchClaim(
        bytes32 expectedMerkleRoot,
        MerkleClaim[] calldata Claims
    ) external {
        for (uint i; i < Claims.length; i++) {
            claim(
                Claims[i].stakingProvider,
                Claims[i].beneficiary,
                Claims[i].amount,
                expectedMerkleRoot,
                Claims[i].proof
            );
        }
    }

    /**
     * @notice Claim a batch of rewards generated by the Threshold Network
     *         applications.
     */
    function batchClaim(address[] calldata stakingProviders) external {
        for (uint i; i < stakingProviders.length; i++) {
            claim(stakingProviders[i]);
        }
    }

    /**
     * @notice Check if a merkle proof is valid.
     */
    function verifyMerkleProof(
        bytes32[] calldata merkleProof,
        bytes32 root,
        bytes32 leaf
    ) public pure returns (bool) {
        return merkleProof.verify(root, leaf);
    }
}
