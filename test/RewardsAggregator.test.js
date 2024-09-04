const fs = require("fs")
const { ethers } = require("hardhat")
const { expect } = require("chai")
const { before, beforeEach, describe, it } = require("mocha")
const { MerkleTree } = require("merkletreejs")
const fc = require("fast-check")
const keccak256 = require("keccak256")
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers")

const { genMerkleLeaf, onlyUnique, deployContractsFixture } = require("./utils")
const { dist } = require("./constants")
const { cumDist } = require("./constants")

describe("Rewards Aggregator contract", function () {
  describe("when deploying RewardsAggregator", async function () {
    it("should be deployed", async function () {
      const RewardsAggregator = await ethers.getContractFactory(
        "RewardsAggregator"
      )
      const {
        owner,
        rewardsHolder,
        token,
        application,
        oldCumulativeMerkleDrop,
      } = await loadFixture(deployContractsFixture)

      const rewardsAggregator = await RewardsAggregator.deploy(
        token.address,
        application.address,
        oldCumulativeMerkleDrop.address,
        rewardsHolder.address,
        owner.address
      )

      expect(await rewardsAggregator.token()).to.equal(token.address)
      expect(await rewardsAggregator.application()).to.equal(
        application.address
      )
      expect(await rewardsAggregator.rewardsHolder()).to.equal(
        rewardsHolder.address
      )
      expect(await rewardsAggregator.oldCumulativeMerkleDrop()).to.equal(
        oldCumulativeMerkleDrop.address
      )
      expect(await rewardsAggregator.owner()).to.equal(owner.address)
    })

    it("should not be possible to deploy with no token address", async function () {
      const RewardsAggregator = await ethers.getContractFactory(
        "RewardsAggregator"
      )
      const { owner, rewardsHolder, application, oldCumulativeMerkleDrop } =
        await loadFixture(deployContractsFixture)

      const tokenAddress = ethers.constants.AddressZero
      await expect(
        RewardsAggregator.deploy(
          tokenAddress,
          application.address,
          oldCumulativeMerkleDrop.address,
          rewardsHolder.address,
          owner.address
        )
      ).to.be.reverted
    })

    it("should not be possible to deploy with no minted tokens", async function () {
      const Token = await ethers.getContractFactory("TokenMock")
      const RewardsAggregator = await ethers.getContractFactory(
        "RewardsAggregator"
      )
      const { owner, rewardsHolder, application, oldCumulativeMerkleDrop } =
        await loadFixture(deployContractsFixture)

      const tokenWithNoMint = await Token.deploy()

      await expect(
        RewardsAggregator.deploy(
          tokenWithNoMint.address,
          application.address,
          oldCumulativeMerkleDrop.address,
          rewardsHolder.address,
          owner.address
        )
      ).to.be.revertedWith("Token contract must be set")
    })

    it("should not be possible to deploy with no rewards holder", async function () {
      const RewardsAggregator = await ethers.getContractFactory(
        "RewardsAggregator"
      )
      const { owner, token, application, oldCumulativeMerkleDrop } =
        await loadFixture(deployContractsFixture)

      const rewardsHolder = ethers.constants.AddressZero
      await expect(
        RewardsAggregator.deploy(
          token.address,
          application.address,
          oldCumulativeMerkleDrop.address,
          rewardsHolder,
          owner.address
        )
      ).to.be.revertedWith("Rewards Holder must be an address")
    })

    it("should not be possible to deploy with no application", async function () {
      const RewardsAggregator = await ethers.getContractFactory(
        "RewardsAggregator"
      )
      const { owner, rewardsHolder, token, oldCumulativeMerkleDrop } =
        await loadFixture(deployContractsFixture)

      const applicationAddress = ethers.constants.AddressZero
      await expect(
        RewardsAggregator.deploy(
          token.address,
          applicationAddress,
          oldCumulativeMerkleDrop.address,
          rewardsHolder.address,
          owner.address
        )
      ).to.be.revertedWith("Application must be an address")
    })

    it("should not be possible to deploy with no old Merkle contract", async function () {
      const RewardsAggregator = await ethers.getContractFactory(
        "RewardsAggregator"
      )
      const { owner, rewardsHolder, token, application } = await loadFixture(
        deployContractsFixture
      )

      const fakeOldCumulativeMerkleContractAddr = ethers.constants.AddressZero
      await expect(
        RewardsAggregator.deploy(
          token.address,
          application.address,
          fakeOldCumulativeMerkleContractAddr,
          rewardsHolder.address,
          owner.address
        )
      ).to.be.reverted
    })

    it("should not be possible to deploy with incompatible old Merkle contract", async function () {
      const Token = await ethers.getContractFactory("TokenMock")
      const CumulativeMerkleDrop = await ethers.getContractFactory(
        "CumulativeMerkleDrop"
      )
      const RewardsAggregator = await ethers.getContractFactory(
        "RewardsAggregator"
      )
      const { owner, rewardsHolder, token, application } = await loadFixture(
        deployContractsFixture
      )

      const fakeToken = await Token.deploy()
      await fakeToken.mint(rewardsHolder.address, 1)
      const fakeOldCumulativeMerkleDrop = await CumulativeMerkleDrop.deploy(
        fakeToken.address,
        rewardsHolder.address,
        owner.address
      )
      await expect(
        RewardsAggregator.deploy(
          token.address,
          application.address,
          fakeOldCumulativeMerkleDrop.address,
          rewardsHolder.address,
          owner.address
        )
      ).to.be.revertedWith("Incompatible old Merkle Distribution contract")
    })
  })

  describe("when setting Merkle Root", async function () {
    it("should be 0 before setting it up", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const contractMerkleRoot = await rewardsAggregator.merkleRoot()
      expect(parseInt(contractMerkleRoot, 16)).to.equal(0)
    })

    it("should be possible to set a new Merkle Root", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const merkleRoot = dist.merkleRoot
      await rewardsAggregator.setMerkleRoot(merkleRoot)
      expect(await rewardsAggregator.merkleRoot()).to.equal(merkleRoot)
    })

    it("should be possible to set a second new Merkle Root", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      await rewardsAggregator.setMerkleRoot(dist.merkleRoot)
      await rewardsAggregator.setMerkleRoot(cumDist.merkleRoot)
      expect(await rewardsAggregator.merkleRoot()).to.equal(cumDist.merkleRoot)
    })

    it("should be emitted an event", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const prevMerkleRoot = await rewardsAggregator.merkleRoot()
      const nextMerkleRoot = dist.merkleRoot
      const tx = rewardsAggregator.setMerkleRoot(nextMerkleRoot)
      await expect(tx)
        .to.emit(rewardsAggregator, "MerkleRootUpdated")
        .withArgs(prevMerkleRoot, nextMerkleRoot)
    })

    it("only contract's owner should can change Merkle Root", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const [, signer1] = await ethers.getSigners()
      await expect(
        rewardsAggregator.connect(signer1).setMerkleRoot(dist.merkleRoot)
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe("when setting Rewards Holder", async function () {
    it("should be possible to set a new Rewards Holder address", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const rewardsHolder = "0xF8653523beEB1799516f0BBB56B72a3F236176B5"
      await rewardsAggregator.setRewardsHolder(rewardsHolder)
      expect(await rewardsAggregator.rewardsHolder()).to.equal(rewardsHolder)
    })

    it("should not be possible to set an invalid address", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const rewardsHolder = ethers.constants.AddressZero
      await expect(
        rewardsAggregator.setRewardsHolder(rewardsHolder)
      ).to.be.revertedWith("Rewards Holder must be an address")
    })

    it("should be emitted an event", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const prevRewardsHolder = await rewardsAggregator.rewardsHolder()
      const newRewardsHolder = "0xF8653523beEB1799516f0BBB56B72a3F236176B5"
      const tx = rewardsAggregator.setRewardsHolder(newRewardsHolder)
      await expect(tx)
        .to.emit(rewardsAggregator, "RewardsHolderUpdated")
        .withArgs(prevRewardsHolder, newRewardsHolder)
    })

    it("only contract's owner should can change Rewards Holder", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const newRewardsHolder = "0xF8653523beEB1799516f0BBB56B72a3F236176B5"
      const [, , , , , signer1] = await ethers.getSigners()
      await expect(
        rewardsAggregator.connect(signer1).setRewardsHolder(newRewardsHolder)
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe("when verifying a Merkle Proof", async function () {
    it("should be verified if Merkle proof is correct", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const stakingProviders = Object.keys(dist.claims)

      for (let stakingProvider of stakingProviders) {
        const beneficiary = dist.claims[stakingProvider].beneficiary
        const amount = dist.claims[stakingProvider].amount
        const claimProof = dist.claims[stakingProvider].proof
        const leaf = genMerkleLeaf(stakingProvider, beneficiary, amount)
        const verif = await rewardsAggregator.verifyMerkleProof(
          claimProof,
          dist.merkleRoot,
          leaf
        )
        expect(verif).to.be.true
      }
    })

    it("should not be verified if no Merkle Proof", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const stakingProviders = Object.keys(dist.claims)

      for (let stakingProvider of stakingProviders) {
        const beneficiary = dist.claims[stakingProvider].beneficiary
        const amount = dist.claims[stakingProvider].amount
        // No claim proof
        const claimProof = []
        const leaf = genMerkleLeaf(stakingProvider, beneficiary, amount)
        const verif = await rewardsAggregator.verifyMerkleProof(
          claimProof,
          dist.merkleRoot,
          leaf
        )
        expect(verif).to.be.false
      }
    })

    it("should not be verified with incorrect Merkle Proof", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const stakingProviders = Object.keys(dist.claims)

      for (let stakingProvider of stakingProviders) {
        const beneficiary = dist.claims[stakingProvider].beneficiary
        const amount = dist.claims[stakingProvider].amount
        // Fake claim proof
        const claimProof = [
          MerkleTree.bufferToHex(keccak256("proof1")),
          MerkleTree.bufferToHex(keccak256("proof2")),
        ]
        const leaf = genMerkleLeaf(stakingProvider, beneficiary, amount)
        const verif = await rewardsAggregator.verifyMerkleProof(
          claimProof,
          dist.merkleRoot,
          leaf
        )
        expect(verif).to.be.false
      }
    })

    it("should not be verified a Merkle Proof with incorrect root", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const stakingProviders = Object.keys(dist.claims)

      for (let stakingProvider of stakingProviders) {
        const beneficiary = dist.claims[stakingProvider].beneficiary
        const amount = dist.claims[stakingProvider].amount
        const claimProof = dist.claims[stakingProvider].proof
        const leaf = genMerkleLeaf(stakingProvider, beneficiary, amount)
        // Fake Merkle root
        const merkleRoot = "0x" + "f".repeat(64)
        const verif = await rewardsAggregator.verifyMerkleProof(
          claimProof,
          merkleRoot,
          leaf
        )
        expect(verif).to.be.false
      }
    })

    it("should not be verified a Merkle Proof with incorrect amount", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const stakingProviders = Object.keys(dist.claims)

      for (let stakingProvider of stakingProviders) {
        const beneficiary = dist.claims[stakingProvider].beneficiary
        // Fake amount
        const amount = dist.claims[stakingProvider].amount + 1
        const claimProof = dist.claims[stakingProvider].proof
        const leaf = genMerkleLeaf(stakingProvider, beneficiary, amount)
        const verif = await rewardsAggregator.verifyMerkleProof(
          claimProof,
          dist.merkleRoot,
          leaf
        )
        expect(verif).to.be.false
      }
    })

    it("should not be verified a Merkle Proof with incorrect beneficiary", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const stakingProviders = Object.keys(dist.claims)

      for (let stakingProvider of stakingProviders) {
        // Fake beneficiary
        const beneficiary = "0xF8653523beEB1799516f0BBB56B72a3F236176B5"
        const amount = dist.claims[stakingProvider].amount
        const claimProof = dist.claims[stakingProvider].proof
        const leaf = genMerkleLeaf(stakingProvider, beneficiary, amount)
        const verif = await rewardsAggregator.verifyMerkleProof(
          claimProof,
          dist.merkleRoot,
          leaf
        )
        expect(verif).to.be.false
      }
    })

    it("should not be verified a Merkle Proof with incorrect staking provider", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const stakingProviders = Object.keys(dist.claims)

      for (let stakingProvider of stakingProviders) {
        // Fake staking provider
        const fakeStakingProvider = "0xF8653523beEB1799516f0BBB56B72a3F236176B5"
        const beneficiary = dist.claims[stakingProvider].beneficiary
        const amount = dist.claims[stakingProvider].amount + 1
        const claimProof = dist.claims[stakingProvider].proof
        const leaf = genMerkleLeaf(fakeStakingProvider, beneficiary, amount)
        const verif = await rewardsAggregator.verifyMerkleProof(
          claimProof,
          dist.merkleRoot,
          leaf
        )
        expect(verif).to.be.false
      }
    })

    it("should be verified the past distributions", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)

      // Read the dists folders and take only those with YYYY/MM/DD format
      let distDates = fs
        .readdirSync("./distributions")
        .filter((dist) => /^\d{4}-\d{2}-\d{2}$/.test(dist))

      // Taking only the first distribution because it takes too much time to
      // run the tests for all the dists. Comment out this line for full test
      distDates = [distDates[0]]

      for (let distDate of distDates) {
        const data = fs.readFileSync(
          `./distributions/${distDate}/MerkleDist.json`
        )
        const dist = JSON.parse(data)
        const stakingProviders = Object.keys(dist.claims)

        for (let stakingProvider of stakingProviders) {
          const beneficiary = dist.claims[stakingProvider].beneficiary
          const amount = dist.claims[stakingProvider].amount
          const claimProof = dist.claims[stakingProvider].proof
          const leaf = genMerkleLeaf(stakingProvider, beneficiary, amount)
          const verif = await rewardsAggregator.verifyMerkleProof(
            claimProof,
            dist.merkleRoot,
            leaf
          )
          expect(verif).to.be.true
        }
      }
    })
  })

  describe("when claiming rewards generated by Merkle distribution", async function () {
    it("should not be possible to claim if no Merkle Root is set", async function () {
      const { token, rewardsHolder, rewardsAggregator } = await loadFixture(
        deployContractsFixture
      )
      await token.mint(rewardsHolder.address, dist.totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(rewardsAggregator.address, dist.totalAmount)

      const stakingProvider = Object.keys(dist.claims)[0]
      const beneficiary = dist.claims[stakingProvider].beneficiary
      const amount = dist.claims[stakingProvider].amount
      const proof = dist.claims[stakingProvider].proof

      await expect(
        rewardsAggregator.claimMerkle(
          stakingProvider,
          beneficiary,
          amount,
          dist.merkleRoot,
          proof
        )
      ).to.be.revertedWith("Merkle root was updated")
    })
    it("should not be possible to claim if Merkle Root is not correct", async function () {
      const { token, rewardsHolder, rewardsAggregator } = await loadFixture(
        deployContractsFixture
      )
      await token.mint(rewardsHolder.address, dist.totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(rewardsAggregator.address, dist.totalAmount)

      const fakeMerkleRoot = "0x" + "f".repeat(64)
      await rewardsAggregator.setMerkleRoot(fakeMerkleRoot)

      const stakingProvider = Object.keys(dist.claims)[0]
      const beneficiary = dist.claims[stakingProvider].beneficiary
      const amount = dist.claims[stakingProvider].amount
      const proof = dist.claims[stakingProvider].proof

      await expect(
        rewardsAggregator.claimMerkle(
          stakingProvider,
          beneficiary,
          amount,
          dist.merkleRoot,
          proof
        )
      ).to.be.revertedWith("Merkle root was updated")
    })
    it("should not be possible to claim if Merkle Proof is not correct", async function () {
      const { token, rewardsHolder, rewardsAggregator } = await loadFixture(
        deployContractsFixture
      )
      await token.mint(rewardsHolder.address, dist.totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(rewardsAggregator.address, dist.totalAmount)
      await rewardsAggregator.setMerkleRoot(dist.merkleRoot)

      const stakingProvider = Object.keys(dist.claims)[0]
      const beneficiary = dist.claims[stakingProvider].beneficiary
      const amount = dist.claims[stakingProvider].amount
      const fakeProof = ["0x" + "f".repeat(64), "0x" + "f".repeat(64)]

      await expect(
        rewardsAggregator.claimMerkle(
          stakingProvider,
          beneficiary,
          amount,
          dist.merkleRoot,
          fakeProof
        )
      ).to.be.revertedWith("Invalid proof")
    })

    it("should not be possible to claim a different amount of tokens", async function () {
      const { token, rewardsHolder, rewardsAggregator } = await loadFixture(
        deployContractsFixture
      )
      await token.mint(rewardsHolder.address, dist.totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(rewardsAggregator.address, dist.totalAmount)
      await rewardsAggregator.setMerkleRoot(dist.merkleRoot)

      const stakingProvider = Object.keys(dist.claims)[0]
      const beneficiary = dist.claims[stakingProvider].beneficiary
      const amount = dist.claims[stakingProvider].amount
      const proof = dist.claims[stakingProvider].proof

      await expect(
        rewardsAggregator.claimMerkle(
          stakingProvider,
          beneficiary,
          amount + 1, // Claiming 1 more token
          dist.merkleRoot,
          proof
        )
      ).to.be.revertedWith("Invalid proof")
    })

    it("should be possible to claim", async function () {
      const { token, rewardsHolder, rewardsAggregator } = await loadFixture(
        deployContractsFixture
      )
      await token.mint(rewardsHolder.address, dist.totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(rewardsAggregator.address, dist.totalAmount)
      await rewardsAggregator.setMerkleRoot(dist.merkleRoot)

      const stakingProvider = Object.keys(dist.claims)[0]
      const beneficiary = dist.claims[stakingProvider].beneficiary
      const amount = dist.claims[stakingProvider].amount
      const proof = dist.claims[stakingProvider].proof

      const prevBalance = await token.balanceOf(beneficiary)
      await rewardsAggregator.claimMerkle(
        stakingProvider,
        beneficiary,
        amount,
        dist.merkleRoot,
        proof
      )
      const afterBalance = await token.balanceOf(beneficiary)

      expect(afterBalance).to.equal(prevBalance.add(amount))
    })
    it("should be taken into account the rewards already claimed in old Merkle contract", async function () {
      const {
        token,
        rewardsHolder,
        oldCumulativeMerkleDrop,
        rewardsAggregator,
      } = await loadFixture(deployContractsFixture)
      await token.mint(rewardsHolder.address, cumDist.totalAmount)

      // There are two example distributions: dist & cumDist. The second one
      // increases the rewards of some of the first one's beneficiaries
      await token
        .connect(rewardsHolder)
        .approve(oldCumulativeMerkleDrop.address, cumDist.totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(rewardsAggregator.address, cumDist.totalAmount)

      const stakingProvider = Object.keys(dist.claims)[0]

      // Setting the Merkle root of the first dist in the old Merkle contract
      await oldCumulativeMerkleDrop.setMerkleRoot(dist.merkleRoot)

      // Claiming the rewards of the first dist in the old Merkle contract
      let prevBalance = await token.balanceOf(
        dist.claims[stakingProvider].beneficiary
      )
      await oldCumulativeMerkleDrop.claim(
        stakingProvider,
        dist.claims[stakingProvider].beneficiary,
        dist.claims[stakingProvider].amount,
        dist.merkleRoot,
        dist.claims[stakingProvider].proof
      )

      let afterBalance = await token.balanceOf(
        dist.claims[stakingProvider].beneficiary
      )

      // Just checking the rewards were claimed using the old Merkle contract
      expect(afterBalance).to.equal(
        prevBalance.add(dist.claims[stakingProvider].amount)
      )

      // Now we are going to claim the 2nd rewards dist using RewardsAggregator
      await rewardsAggregator.setMerkleRoot(cumDist.merkleRoot)

      const rewardsToBeClaimed =
        cumDist.claims[stakingProvider].amount -
        dist.claims[stakingProvider].amount

      prevBalance = await token.balanceOf(
        dist.claims[stakingProvider].beneficiary
      )

      const tx = await rewardsAggregator.claimMerkle(
        stakingProvider,
        cumDist.claims[stakingProvider].beneficiary,
        cumDist.claims[stakingProvider].amount,
        cumDist.merkleRoot,
        cumDist.claims[stakingProvider].proof
      )

      afterBalance = await token.balanceOf(
        dist.claims[stakingProvider].beneficiary
      )

      expect(afterBalance).to.equal(prevBalance.add(rewardsToBeClaimed))
      expect(tx)
        .to.emit(rewardsAggregator, "MerkleClaimed")
        .withArgs(
          stakingProvider,
          rewardsToBeClaimed,
          cumDist.claims[stakingProvider].beneficiary,
          cumDist.merkleRoot
        )
    })

    it("should not be possible to claim twice or if no rewards available", async function () {
      const { token, rewardsHolder, rewardsAggregator } = await loadFixture(
        deployContractsFixture
      )
      await token.mint(rewardsHolder.address, dist.totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(rewardsAggregator.address, dist.totalAmount)
      await rewardsAggregator.setMerkleRoot(dist.merkleRoot)

      const stakingProvider = Object.keys(dist.claims)[0]
      const beneficiary = dist.claims[stakingProvider].beneficiary
      const amount = dist.claims[stakingProvider].amount
      const proof = dist.claims[stakingProvider].proof

      await rewardsAggregator.claimMerkle(
        stakingProvider,
        beneficiary,
        amount,
        dist.merkleRoot,
        proof
      )

      await expect(
        rewardsAggregator.claimMerkle(
          stakingProvider,
          beneficiary,
          amount,
          dist.merkleRoot,
          proof
        )
      ).to.be.revertedWith("Nothing to claim")
    })
    it("should be emitted an event when claiming", async function () {
      const { token, rewardsHolder, rewardsAggregator } = await loadFixture(
        deployContractsFixture
      )
      await token.mint(rewardsHolder.address, dist.totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(rewardsAggregator.address, dist.totalAmount)
      await rewardsAggregator.setMerkleRoot(dist.merkleRoot)

      const stakingProvider = Object.keys(dist.claims)[0]
      const beneficiary = dist.claims[stakingProvider].beneficiary
      const amount = dist.claims[stakingProvider].amount
      const proof = dist.claims[stakingProvider].proof

      const tx = rewardsAggregator.claimMerkle(
        stakingProvider,
        beneficiary,
        amount,
        dist.merkleRoot,
        proof
      )

      await expect(tx)
        .to.emit(rewardsAggregator, "MerkleClaimed")
        .withArgs(stakingProvider, amount, beneficiary, dist.merkleRoot)
    })
    it("should be transferred the tokens when claiming", async function () {
      const { token, rewardsHolder, rewardsAggregator } = await loadFixture(
        deployContractsFixture
      )
      await token.mint(rewardsHolder.address, dist.totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(rewardsAggregator.address, dist.totalAmount)
      await rewardsAggregator.setMerkleRoot(dist.merkleRoot)

      const stakingProvider = Object.keys(dist.claims)[0]
      const beneficiary = dist.claims[stakingProvider].beneficiary
      const amount = dist.claims[stakingProvider].amount
      const proof = dist.claims[stakingProvider].proof

      const prevBalanceBenef = await token.balanceOf(beneficiary)
      const prevBalanceRewardsHolder = await token.balanceOf(
        rewardsHolder.address
      )
      await rewardsAggregator.claimMerkle(
        stakingProvider,
        beneficiary,
        amount,
        dist.merkleRoot,
        proof
      )
      const afterBalanceBenef = await token.balanceOf(beneficiary)
      const afterBalanceRewardsHolder = await token.balanceOf(
        rewardsHolder.address
      )

      expect(afterBalanceBenef).to.equal(prevBalanceBenef.add(amount))
      expect(afterBalanceRewardsHolder).to.equal(
        prevBalanceRewardsHolder.sub(amount)
      )
    })
  })

  describe("when asking for the cumulative Merkle already claimed", async function () {
    it("should return zero if no rewards have been already claimed", async function () {
      const { rewardsAggregator } = await loadFixture(deployContractsFixture)
      const [, , , , , signer1] = await ethers.getSigners()
      const cumulativeMerkleClaimed =
        await rewardsAggregator.cumulativeMerkleClaimed(signer1.address)
      expect(cumulativeMerkleClaimed).to.equal(0)
    })

    it("should return correct amount when been claimed only through the RewardsAggregator contract", async function () {
      const { token, rewardsHolder, rewardsAggregator } = await loadFixture(
        deployContractsFixture
      )
      await token.mint(rewardsHolder.address, dist.totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(rewardsAggregator.address, dist.totalAmount)
      await rewardsAggregator.setMerkleRoot(dist.merkleRoot)

      const stakingProvider = Object.keys(dist.claims)[0]
      const beneficiary = dist.claims[stakingProvider].beneficiary
      const amount = dist.claims[stakingProvider].amount
      const proof = dist.claims[stakingProvider].proof

      // First we claim the rewards
      await rewardsAggregator.claimMerkle(
        stakingProvider,
        beneficiary,
        amount,
        dist.merkleRoot,
        proof
      )

      // Now, claimed rewards should return the claimed amount
      const rewardsClaimed = await rewardsAggregator.cumulativeMerkleClaimed(
        stakingProvider
      )

      expect(rewardsClaimed).to.equal(amount)
    })
    it("should return correct amount of rewards when been claimed only through the old Merkle contract", async function () {
      const {
        token,
        rewardsHolder,
        oldCumulativeMerkleDrop,
        rewardsAggregator,
      } = await loadFixture(deployContractsFixture)

      await token.mint(rewardsHolder.address, dist.totalAmount)

      await token
        .connect(rewardsHolder)
        .approve(oldCumulativeMerkleDrop.address, dist.totalAmount)

      await oldCumulativeMerkleDrop.setMerkleRoot(dist.merkleRoot)

      const stakingProvider = Object.keys(dist.claims)[0]
      const beneficiary = dist.claims[stakingProvider].beneficiary
      const amount = dist.claims[stakingProvider].amount
      const proof = dist.claims[stakingProvider].proof

      // First we claim the rewards using the old Merkle contract
      await oldCumulativeMerkleDrop.claim(
        stakingProvider,
        beneficiary,
        amount,
        dist.merkleRoot,
        proof
      )

      // Now, claimed rewards should return the claimed amount
      const rewardsClaimed = await rewardsAggregator.cumulativeMerkleClaimed(
        stakingProvider
      )

      expect(rewardsClaimed).to.equal(amount)
    })
    it("should return correct amount of rewards when been claimed through both RewardsAggregator and old Merkle contract", async function () {
      const {
        token,
        rewardsHolder,
        oldCumulativeMerkleDrop,
        rewardsAggregator,
      } = await loadFixture(deployContractsFixture)

      await token.mint(rewardsHolder.address, dist.totalAmount)

      await token
        .connect(rewardsHolder)
        .approve(oldCumulativeMerkleDrop.address, dist.totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(rewardsAggregator.address, dist.totalAmount)

      // There are two example distributions: dist & cumDist. The second one
      // increases the rewards of some of the first one's beneficiaries

      await oldCumulativeMerkleDrop.setMerkleRoot(dist.merkleRoot)
      await rewardsAggregator.setMerkleRoot(cumDist.merkleRoot)

      const stakingProvider = Object.keys(dist.claims)[0]

      // First we claim the rewards using the old Merkle contract
      await oldCumulativeMerkleDrop.claim(
        stakingProvider,
        dist.claims[stakingProvider].beneficiary,
        dist.claims[stakingProvider].amount,
        dist.merkleRoot,
        dist.claims[stakingProvider].proof
      )

      // Just checking the rewards were claimed using the old Merkle contract
      let rewardsClaimed = await rewardsAggregator.cumulativeMerkleClaimed(
        stakingProvider
      )
      expect(rewardsClaimed).to.equal(dist.claims[stakingProvider].amount)

      // Let's claim the rewards of the 2nd distribution using RewardsAggregator
      await rewardsAggregator.claimMerkle(
        stakingProvider,
        cumDist.claims[stakingProvider].beneficiary,
        cumDist.claims[stakingProvider].amount,
        cumDist.merkleRoot,
        cumDist.claims[stakingProvider].proof
      )

      // Now, claimed rewards should return the amount of the 2nd distribution
      rewardsClaimed = await rewardsAggregator.cumulativeMerkleClaimed(
        stakingProvider
      )
      expect(rewardsClaimed).to.equal(cumDist.claims[stakingProvider].amount)
    })
  })






  // TODO: from here down, the tests must be reviewed and refactored

  describe("when calling batchClaimWithoutApps", async function () {
    before(function () {
      // numRuns must be less or equal to the number of accounts in `cum_dist`
      const numRuns = 2
      fc.configureGlobal({ numRuns: numRuns, skipEqualValues: true })
    })

    it("should accounts get tokens", async function () {
      const { token, rewardsHolder, merkleDist, owner } = await loadFixture(
        deployContractsFixture
      )
      const merkleRoot = dist.merkleRoot
      const totalAmount = ethers.BigNumber.from(dist.totalAmount)
      const proofAccounts = Object.keys(dist.claims)

      await token.mint(rewardsHolder.address, totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(merkleDist.address, totalAmount)
      await merkleDist.connect(owner).setMerkleRoot(merkleRoot)

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 1 }),
          async function (index) {
            const claimAccounts = proofAccounts.slice(
              (proofAccounts.length / 2) * index,
              (proofAccounts.length / 2) * (index + 1)
            )
            const claimAmounts = Array.from(claimAccounts).map((claimAccount) =>
              ethers.BigNumber.from(dist.claims[claimAccount].amount)
            )
            const claimProofs = Array.from(claimAccounts).map(
              (claimAccount) => dist.claims[claimAccount].proof
            )
            const claimBeneficiaries = Array.from(claimAccounts).map(
              (claimAccount) => dist.claims[claimAccount].beneficiary
            )
            const claimStructs = Array.from(claimAccounts).map(
              (claimAccount, index) => [
                claimAccount,
                claimBeneficiaries[index],
                claimAmounts[index],
                claimProofs[index],
              ]
            )
            const prevBalances = await Promise.all(
              claimBeneficiaries.map(
                async (beneficiary) => await token.balanceOf(beneficiary)
              )
            )
            await merkleDist.batchClaimWithoutApps(merkleRoot, claimStructs)

            const afterBalancesHex = await Promise.all(
              claimBeneficiaries.map(
                async (beneficiary) => await token.balanceOf(beneficiary)
              )
            )
            const afterBalances = Array.from(afterBalancesHex).map(
              (afterAmmount) => parseInt(afterAmmount["_hex"], 16)
            )
            const additions = Object.fromEntries(
              claimBeneficiaries.filter(onlyUnique).map((i) => [i, 0])
            )
            claimBeneficiaries.forEach((beneficiary, index) => {
              additions[beneficiary] += parseInt(claimAmounts[index], 10)
            })
            const expBalances = Array.from(prevBalances).map(
              (prevAmmount, index) =>
                parseInt(prevAmmount + additions[claimBeneficiaries[index]], 10)
            )
            expBalances.forEach((expAmount, index) => {
              expect(expAmount).to.equal(afterBalances[index])
            })
          }
        )
      )
    })
  })

  // TODO: describe when calling batch claim (including apps)

  describe("when calling claimWithoutApp", async function () {
    before(function () {
      // numRuns must be less or equal to the number of accounts in `cum_dist`
      const numRuns = Object.keys(dist.claims).length
      fc.configureGlobal({ numRuns: numRuns, skipEqualValues: true })
    })

    it("should be emitted an event", async function () {
      const { token, rewardsHolder, merkleDist } = await loadFixture(
        deployContractsFixture
      )

      const merkleRoot = dist.merkleRoot
      const totalAmount = ethers.BigNumber.from(dist.totalAmount)
      const proofAccounts = Object.keys(dist.claims)

      await token.mint(rewardsHolder.address, totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(merkleDist.address, totalAmount)
      await merkleDist.setMerkleRoot(merkleRoot)

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: proofAccounts.length - 1 }),
          async function (index) {
            const claimAccount = proofAccounts[index]
            const claimAmount = ethers.BigNumber.from(
              dist.claims[claimAccount].amount
            )
            const claimProof = dist.claims[claimAccount].proof
            const claimBeneficiary = dist.claims[claimAccount].beneficiary
            const tx = merkleDist.claimWithoutApps(
              claimAccount,
              claimBeneficiary,
              claimAmount,
              merkleRoot,
              claimProof
            )
            await expect(tx)
              .to.emit(merkleDist, "Claimed")
              .withArgs(claimAccount, claimAmount, claimBeneficiary, merkleRoot)
          }
        )
      )
    })

    it("should accounts get tokens", async function () {
      const { token, rewardsHolder, merkleDist } = await loadFixture(
        deployContractsFixture
      )

      const merkleRoot = dist.merkleRoot
      const totalAmount = ethers.BigNumber.from(dist.totalAmount)
      const proofAccounts = Object.keys(dist.claims)

      await token.mint(rewardsHolder.address, totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(merkleDist.address, totalAmount)
      await merkleDist.setMerkleRoot(merkleRoot)

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: proofAccounts.length - 1 }),
          async function (index) {
            const claimAccount = proofAccounts[index]
            const claimAmount = ethers.BigNumber.from(
              dist.claims[claimAccount].amount
            )
            const claimProof = dist.claims[claimAccount].proof
            const claimBeneficiary = dist.claims[claimAccount].beneficiary

            const prevBalance = await token.balanceOf(claimBeneficiary)
            const expBalance = prevBalance.add(claimAmount)
            await merkleDist.claimWithoutApps(
              claimAccount,
              claimBeneficiary,
              claimAmount,
              merkleRoot,
              claimProof
            )
            const afterBalance = await token.balanceOf(claimBeneficiary)
            expect(expBalance).to.equal(afterBalance)
          }
        )
      )
    })

    it("should rewards holder to reduce its balance", async function () {
      const { rewardsHolder, merkleDist, token } = await loadFixture(
        deployContractsFixture
      )

      const merkleRoot = dist.merkleRoot
      const totalAmount = ethers.BigNumber.from(dist.totalAmount)
      const proofAccounts = Object.keys(dist.claims)

      await token.mint(rewardsHolder.address, totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(merkleDist.address, totalAmount)
      await merkleDist.setMerkleRoot(merkleRoot)

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: proofAccounts.length - 1 }),
          async function (index) {
            const [, rewardsHolder] = await ethers.getSigners()
            const claimAccount = proofAccounts[index]
            const claimAmount = ethers.BigNumber.from(
              dist.claims[claimAccount].amount
            )
            const claimProof = dist.claims[claimAccount].proof
            const claimBeneficiary = dist.claims[claimAccount].beneficiary

            const preBalance = await token.balanceOf(rewardsHolder.address)
            const expBalance = preBalance.sub(claimAmount)
            await merkleDist.claimWithoutApps(
              claimAccount,
              claimBeneficiary,
              claimAmount,
              merkleRoot,
              claimProof
            )
            const afterBalance = await token.balanceOf(rewardsHolder.address)
            expect(expBalance).to.equal(afterBalance)
          }
        )
      )
    })

    it("should not be possible to claim for fake accounts", async function () {
      const { rewardsHolder, merkleDist, token } = await loadFixture(
        deployContractsFixture
      )

      const merkleRoot = dist.merkleRoot
      const totalAmount = ethers.BigNumber.from(dist.totalAmount)

      await token.mint(rewardsHolder.address, totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(merkleDist.address, totalAmount)
      await merkleDist.setMerkleRoot(merkleRoot)

      const claimAccount = ethers.Wallet.createRandom().address
      const claimAmount = 100000
      const claimProof = [
        "0xf558bba7dd8aef6fdfb36ea106d965fd7ef483aa217cc02e2c33b78cdfb74cab",
        "0x7a8326f3dfbbddc4a0bc1e3e5005d4cecf6a7c89d386692a27dc5235b55e92cd",
      ]
      const claimBeneficiary = ethers.Wallet.createRandom().address
      await expect(
        merkleDist.claimWithoutApps(
          claimAccount,
          claimBeneficiary,
          claimAmount,
          merkleRoot,
          claimProof
        )
      ).to.be.revertedWith("Invalid proof")
    })

    it("should not be possible to claim a different amount of tokens", async function () {
      const { rewardsHolder, merkleDist, token } = await loadFixture(
        deployContractsFixture
      )

      const merkleRoot = dist.merkleRoot
      const totalAmount = ethers.BigNumber.from(dist.totalAmount)
      const proofAccounts = Object.keys(dist.claims)

      await token.mint(rewardsHolder.address, totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(merkleDist.address, totalAmount)
      await merkleDist.setMerkleRoot(merkleRoot)

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: proofAccounts.length - 1 }),
          fc.integer({ min: 0, max: 10000000 }),
          async function (index, claimAmount) {
            const claimAccount = proofAccounts[index]
            const claimProof = dist.claims[claimAccount].proof
            const claimBeneficiary = dist.claims[claimAccount].beneficiary
            await expect(
              merkleDist.claimWithoutApps(
                claimAccount,
                claimBeneficiary,
                claimAmount,
                merkleRoot,
                claimProof
              )
            ).to.be.revertedWith("Invalid proof")
          }
        )
      )
    })

    it("should not be possible to claim twice", async function () {
      const { rewardsHolder, merkleDist, token } = await loadFixture(
        deployContractsFixture
      )

      const merkleRoot = dist.merkleRoot
      const totalAmount = ethers.BigNumber.from(dist.totalAmount)
      const proofAccounts = Object.keys(dist.claims)

      await token.mint(rewardsHolder.address, totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(merkleDist.address, totalAmount)
      await merkleDist.setMerkleRoot(merkleRoot)

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: proofAccounts.length - 1 }),
          async function (index) {
            const claimAccount = proofAccounts[index]
            const claimAmount = ethers.BigNumber.from(
              dist.claims[claimAccount].amount
            )
            const claimProof = dist.claims[claimAccount].proof
            const claimBeneficiary = dist.claims[claimAccount].beneficiary
            await merkleDist.claimWithoutApps(
              claimAccount,
              claimBeneficiary,
              claimAmount,
              merkleRoot,
              claimProof
            )
            await expect(
              merkleDist.claimWithoutApps(
                claimAccount,
                claimBeneficiary,
                claimAmount,
                merkleRoot,
                claimProof
              )
            ).to.be.revertedWith("Nothing to claim")
          }
        )
      )
    })
  })

  describe("when calling claim", async function () {
    beforeEach(async function () {})

    // For simplicity reasons, the application mock used on these tests will
    // consider that the staking provider addr is the beneficiary of the claim
  })

  describe("when set a new Merkle Distribution (cumulative)", async function () {
    before(function () {
      // numRuns must be less or equal to the number of accounts in `cum_dist`
      const numRuns = Object.keys(cumDist.claims).length
      fc.configureGlobal({ numRuns: numRuns, skipEqualValues: true })
    })

    it("should be possible to set a new Merkle Root after claiming (without apps)", async function () {
      const { token, rewardsHolder, merkleDist } = await loadFixture(
        deployContractsFixture
      )

      const merkleRoot = dist.merkleRoot
      const cumulativeMerkleRoot = cumDist.merkleRoot
      const totalAmount = ethers.BigNumber.from(dist.totalAmount)
      const proofAccounts = Object.keys(dist.claims)

      await token.mint(rewardsHolder.address, totalAmount)
      await token
        .connect(rewardsHolder)
        .approve(merkleDist.address, totalAmount)
      await merkleDist.setMerkleRoot(merkleRoot)

      const claimAccount = proofAccounts[0]
      const claimAmount = ethers.BigNumber.from(
        dist.claims[claimAccount].amount
      )
      const claimProof = dist.claims[claimAccount].proof
      const claimBeneficiary = dist.claims[claimAccount].beneficiary

      await merkleDist.claimWithoutApps(
        claimAccount,
        claimBeneficiary,
        claimAmount,
        merkleRoot,
        claimProof
      )
      await merkleDist.setMerkleRoot(cumulativeMerkleRoot)
      const contractMerkleRoot = await merkleDist.merkleRoot()
      expect(contractMerkleRoot).to.equal(cumulativeMerkleRoot)
    })

    // TODO: new test should be possible to set a new Merkle Root after claiming (WITH apps)

    it("should not be possible to claim using old Merkle Root", async function () {
      const { merkleDist } = await loadFixture(deployContractsFixture)

      const merkleRoot = dist.merkleRoot
      const cumulativeMerkleRoot = cumDist.merkleRoot
      const proofAccounts = Object.keys(dist.claims)

      const claimAccount = proofAccounts[0]
      const claimAmount = ethers.BigNumber.from(
        dist.claims[claimAccount].amount
      )
      const claimProof = dist.claims[claimAccount].proof
      const claimBeneficiary = dist.claims[claimAccount].beneficiary
      await merkleDist.setMerkleRoot(cumulativeMerkleRoot)

      await expect(
        merkleDist.claimWithoutApps(
          claimAccount,
          claimBeneficiary,
          claimAmount,
          merkleRoot,
          claimProof
        )
      ).to.be.revertedWith("Merkle root was updated")
    })

    // TODO: new test should not be possible to claim (with apps) using old Merkle Root

    describe("after claiming (without apps) all tokens of the previous distribution", async function () {
      async function claimAllTokens(token, merkleDist, rewardsHolder) {
        const proofAccounts = Object.keys(dist.claims)

        await token.mint(rewardsHolder.address, dist.totalAmount)
        await token
          .connect(rewardsHolder)
          .approve(merkleDist.address, dist.totalAmount)
        await merkleDist.setMerkleRoot(dist.merkleRoot)

        for (let claimAccount of proofAccounts) {
          const claimAmount = ethers.BigNumber.from(
            dist.claims[claimAccount].amount
          )
          const claimProof = dist.claims[claimAccount].proof
          const claimBeneficiary = dist.claims[claimAccount].beneficiary
          await merkleDist.claimWithoutApps(
            claimAccount,
            claimBeneficiary,
            claimAmount,
            dist.merkleRoot,
            claimProof
          )
        }
      }

      it("should not be possible to claim (without apps) without enough balance in contract", async function () {
        const { merkleDist, token, rewardsHolder } = await loadFixture(
          deployContractsFixture
        )

        await claimAllTokens(token, merkleDist, rewardsHolder)

        const cumulativeProofAccounts = Object.keys(cumDist.claims)

        await merkleDist.setMerkleRoot(cumDist.merkleRoot)
        const claimAccount = cumulativeProofAccounts[0]
        const claimAmount = ethers.BigNumber.from(
          cumDist.claims[claimAccount].amount
        )
        const claimProof = cumDist.claims[claimAccount].proof
        const claimBeneficiary = cumDist.claims[claimAccount].beneficiary

        await expect(
          merkleDist.claimWithoutApps(
            claimAccount,
            claimBeneficiary,
            claimAmount,
            cumDist.merkleRoot,
            claimProof
          )
        ).to.be.revertedWith("Transfer amount exceeds allowance")
      })

      it("should be possible to claim (without apps) new distribution tokens", async function () {
        const { merkleDist, token, rewardsHolder } = await loadFixture(
          deployContractsFixture
        )

        await claimAllTokens(token, merkleDist, rewardsHolder)

        const cumulativeTotalAmount = ethers.BigNumber.from(cumDist.totalAmount)
        const proofAccounts = Object.keys(dist.claims)
        const cumulativeProofAccounts = Object.keys(cumDist.claims)

        await token.mint(rewardsHolder.address, cumulativeTotalAmount)
        await merkleDist.setMerkleRoot(cumDist.merkleRoot)
        await token
          .connect(rewardsHolder)
          .approve(merkleDist.address, cumulativeTotalAmount)

        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 0, max: cumulativeProofAccounts.length - 1 }),
            async function (index) {
              const claimAccount = cumulativeProofAccounts[index]
              const claimAmount = ethers.BigNumber.from(
                cumDist.claims[claimAccount].amount
              )
              const claimProof = cumDist.claims[claimAccount].proof
              const claimBeneficiary = cumDist.claims[claimAccount].beneficiary

              // add up all rewards sent to this beneificiary on previous distribution
              let prevReward = {}
              proofAccounts.forEach((account) => {
                if (dist.claims[account].beneficiary === claimBeneficiary) {
                  prevReward[account] = dist.claims[account].amount
                }
              })

              // update reward for current distribution
              prevReward[claimAccount] = claimAmount
              const reducer = (accumulator, curr) =>
                parseInt(accumulator, 10) + curr
              const totalReward = Object.values(prevReward)

              await merkleDist.claimWithoutApps(
                claimAccount,
                claimBeneficiary,
                claimAmount,
                cumDist.merkleRoot,
                claimProof
              )
              const balance = await token.balanceOf(claimBeneficiary)
              expect(totalReward.reduce(reducer)).to.equal(balance)
            }
          )
        )
      })
    })
  })
})
