const hre = require('hardhat');
const { getChainId, ethers } = hre;

module.exports = async ({ deployments, getNamedAccounts }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const {deploy} = deployments;
    const {deployer, tokenContract, rewardsHolder, tacoApp, owner} = await getNamedAccounts();
    const args = [tokenContract, tacoApp, rewardsHolder, owner];
    const merkleDrop = await deploy('CumulativeMerkleDrop', {
        from: deployer,
        args,
    });

    console.log('CumulativeMerkleDrop deployed to:', merkleDrop.address);

    if (await getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: merkleDrop.address,
            constructorArguments: args,
        });
    }
};
