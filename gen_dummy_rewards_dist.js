// Process to generate new Merkle distributions
// 1. Modify the Merkle input so the rewards amount is increased
// 2. Run the script: node gen_dummy_rewards_dist.js. The file MerkleDist.json will be updated
// 3. Copy the new merkleRoot value from MerkleDist.json
// 4. Update the merkle root on the contract. Note that the owner is 0x3B42d26E19FF860bC4dEbB920DD8caA53F93c600: https://sepolia.etherscan.io/address/0xBF807283ef74616065A5595ACa49b25A569A33c6#writeContract#F4


require("dotenv").config()
const fs = require("fs")
const MerkleDist = require("./src/scripts/utils/merkle_dist.js")

async function main() {
  const merkleInput = JSON.parse(
    fs.readFileSync("./merkleInput.json")
  )
  // Generate the Merkle distribution
  const merkleDist = MerkleDist.genMerkleDist(merkleInput)

  // Write the Merkle distribution to JSON file
  try {
    fs.writeFileSync(
      "./MerkleDist.json",
      JSON.stringify(merkleDist, null, 4)
    )
  } catch (err) {
    console.error(err)
    return
  }
}

main()
