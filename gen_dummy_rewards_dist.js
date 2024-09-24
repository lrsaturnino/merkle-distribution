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
