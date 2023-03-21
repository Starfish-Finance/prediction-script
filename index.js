const ethers = require("ethers");
const PredictionMarketV1ABI = require("./contract/abi/PredictionMarketV1.json");
const logger = require("pino")();

logger.info("prediction init...")

let privateKey = process.env.PRIVATE_KEY

let rpcUrl = process.env.RPC_URL
let provider = new ethers.providers.JsonRpcProvider(rpcUrl)
let wallet = new ethers.Wallet(privateKey, provider)

logger.info("prediction init wallet success")

let PredictionMarketV1Address = process.env.PredictionMarketV1_ADDRESS

let PredictionMarketV1Contract = new ethers.Contract(
  PredictionMarketV1Address,
  PredictionMarketV1ABI,
  provider
)
let PredictionMarketV1ContractWithSign = PredictionMarketV1Contract.connect(wallet)

logger.info("prediction init contract success")

// Load Env var
require("dotenv").config();

/**
 * 等待交易结果
 * @param {String} transactionHash 交易hash
 * @returns
 */
async function waitForTransaction(transactionHash) {
  return new Promise((resolve) => {
      const check = async () => {
          const transactionInformation =
              await provider.waitForTransaction(
                  transactionHash
              );
          if (transactionInformation && transactionInformation.blockHash) {
              //二次验证
              const transactionInfo =
                  await provider.getTransactionReceipt(
                      transactionHash
                  );
              resolve(transactionInfo?.status == 1);
          } else {
              setTimeout(check, 3000);
          }
      };

      check();
  });
}

// async function getGasEstimateGenesisStartRound(PredictionMarketV1ContractWithSign) {
//   let gasEstimate = await PredictionMarketV1ContractWithSign.estimateGas.genesisStartRound();
//   return Math.round(Number(gasEstimate) * 1.3);
// }
// async function getGasEstimateGenesisLockRound(PredictionMarketV1ContractWithSign) {
//   let gasEstimate = await PredictionMarketV1ContractWithSign.estimateGas.genesisLockRound();
//   return Math.round(Number(gasEstimate) * 1.3);
// }
// async function getGasEstimateExecuteRound(PredictionMarketV1ContractWithSign) {
//   let gasEstimate = await PredictionMarketV1ContractWithSign.estimateGas.executeRound();
//   return Math.round(Number(gasEstimate) * 1.3);
// }
// async function getGasEstimatePause(PredictionMarketV1ContractWithSign) {
//   let gasEstimate = await PredictionMarketV1ContractWithSign.estimateGas.pause();
//   return Math.round(Number(gasEstimate) * 1.3);
// }
// async function getGasEstimateUnpause(PredictionMarketV1ContractWithSign) {
//   let gasEstimate = await PredictionMarketV1ContractWithSign.estimateGas.unpause();
//   return Math.round(Number(gasEstimate) * 1.3);
// }

async function runingPrediction() {
  return new Promise((resolve) => {
    const callContract = async () => {
      try {
        logger.info(`check prediction status ${Math.round(new Date() / 1000)}`)

        let currentTimstmp, tx, waitSecond;

        const currentEpoch = await PredictionMarketV1ContractWithSign.currentEpoch();

        logger.info(`check prediction status: currentEpoch is ${currentEpoch} ${typeof currentEpoch} ${currentEpoch + 1}`)

        //检测状态
        let [paused, genesisStartOnce, genesisLockOnce, bufferSeconds, rounds] = await Promise.all([
          PredictionMarketV1ContractWithSign.paused(),
          PredictionMarketV1ContractWithSign.genesisStartOnce(),
          PredictionMarketV1ContractWithSign.genesisLockOnce(),
          PredictionMarketV1ContractWithSign.bufferSeconds(),
          PredictionMarketV1ContractWithSign.rounds(currentEpoch)
        ]);

        logger.info(`check prediction status: paused is ${paused}`)
        logger.info(`check prediction status: genesisStartOnce is ${genesisStartOnce}`)
        logger.info(`check prediction status: genesisLockOnce is ${genesisLockOnce}`)
        logger.info(`check prediction status: bufferSeconds is ${bufferSeconds}`)
        logger.info(`check prediction status: rounds is ${rounds}`)

        //没执行过genesisStartOnce
        if (!paused && !genesisStartOnce) {
          logger.info("prediction need genesisStartRound()")

          tx = await PredictionMarketV1ContractWithSign.genesisStartRound();
          await waitForTransaction(tx.hash);

          logger.info(`prediction genesisStartRound(), tx is ${tx.hash}`)

          currentTimstmp = Math.round(new Date() / 1000);
          rounds = await PredictionMarketV1ContractWithSign.rounds(Number(currentEpoch )+ 1);
          waitSecond = Number(rounds.lockTimestamp) - currentTimstmp;
          waitSecond = waitSecond > 0 ? waitSecond : 0;

          logger.info(`prediction need genesisLockRound() after ${waitSecond} s`)

          setTimeout(callContract, waitSecond * 1000);
          return;
        }

        //执行过genesisStartOnce，未执行过genesisLockOnce，且时间正常
        if (!paused && genesisStartOnce && !genesisLockOnce) {
          logger.info("prediction need genesisLockRound()")

          currentTimstmp = Math.round(new Date() / 1000);

          //还没到时间
          if (currentTimstmp < rounds.lockTimestamp) {
            logger.info("The genesisLockRound() time has not come")
            logger.info(`currentTimstmp = ${currentTimstmp}, rounds.lockTimestamp = ${rounds.lockTimestamp}`)

            waitSecond = Number(rounds.lockTimestamp) - currentTimstmp;
            waitSecond = waitSecond > 0 ? waitSecond : 0;

            logger.info(`prediction need genesisLockRound() after ${waitSecond} s`)

            setTimeout(callContract, waitSecond * 1000);
            return;
          }

          //可以执行genesisLockOnce
          if (currentTimstmp > rounds.lockTimestamp && currentTimstmp < Number(rounds.lockTimestamp) + Number(bufferSeconds)) {
            logger.info("It`s time to genesisLockRound()")

            tx = await PredictionMarketV1ContractWithSign.genesisLockRound();
            await waitForTransaction(tx.hash);

            logger.info(`prediction genesisLockRound(), tx is ${tx.hash}`)

            rounds = await PredictionMarketV1ContractWithSign.rounds(currentEpoch);
            currentTimstmp = Math.round(new Date() / 1000);
            waitSecond = Number(rounds.closeTimestamp) - currentTimstmp;
            waitSecond = waitSecond > 0 ? waitSecond : 0;

            logger.info(`prediction need executeRound() after ${waitSecond} s`)

            setTimeout(callContract, waitSecond * 1000);
            return;
          }

          //miss genesisLockOnce
          if (currentTimstmp >= Number(rounds.lockTimestamp) + Number(bufferSeconds)) {
            logger.info("miss time to genesisLockRound()")

            //pause
            tx = await PredictionMarketV1ContractWithSign.pause();
            await waitForTransaction(tx.hash);
            logger.info(`pause(), tx ${tx.hash}`)

            //unpause
            tx = await PredictionMarketV1ContractWithSign.unpause();
            await waitForTransaction(tx.hash);
            logger.info(`unpause(), tx ${tx.hash}`)

            logger.info("rerun genesisStartRound()")

            callContract();
            return;
          }
        }

        //执行过genesisLockOnce，未执行过executeRound，且时间正常
        if (!paused && genesisStartOnce && genesisLockOnce) {
          logger.info("prediction need executeRound()")

          rounds = await PredictionMarketV1ContractWithSign.rounds(currentEpoch - 1);
          currentTimstmp = Math.round(new Date() / 1000);

          logger.info(`currentTimstmp = ${currentTimstmp}, rounds.closeTimestamp = ${rounds.closeTimestamp}`)

          //还没到时间
          if (currentTimstmp < rounds.closeTimestamp) {
            logger.info("The executeRound() time has not come")

            waitSecond = Number(rounds.closeTimestamp) - currentTimstmp;
            waitSecond = waitSecond > 0 ? waitSecond : 0;

            logger.info(`prediction need executeRound() after ${waitSecond} s`)

            setTimeout(callContract, waitSecond * 1000);
            return;
          }

          //可以执行executeRound
          if (currentTimstmp > rounds.closeTimestamp && currentTimstmp < Number(rounds.closeTimestamp) + Number(bufferSeconds)) {
            logger.info("It`s time to executeRound()")

            tx = await PredictionMarketV1ContractWithSign.executeRound();
            await waitForTransaction(tx.hash);

            logger.info(`prediction executeRound(), tx is ${tx.hash}`)

            rounds = await PredictionMarketV1ContractWithSign.rounds(currentEpoch);
            currentTimstmp = Math.round(new Date() / 1000);
            waitSecond = Number(rounds.closeTimestamp) - currentTimstmp;
            waitSecond = waitSecond > 0 ? waitSecond : 0;

            logger.info(`prediction need executeRound() after ${waitSecond} s`)

            setTimeout(callContract, waitSecond * 1000);
            return;
          }

          //miss executeRound
          if (currentTimstmp >= Number(rounds.closeTimestamp) + Number(bufferSeconds)) {
            logger.info("miss time to executeRound()")

            //pause
            tx = await PredictionMarketV1ContractWithSign.pause();
            await waitForTransaction(tx.hash);
            logger.info(`pause(), tx ${tx.hash}`)

            //unpause
            tx = await PredictionMarketV1ContractWithSign.unpause();
            await waitForTransaction(tx.hash);
            logger.info(`unpause(), tx ${tx.hash}`)

            logger.info("rerun genesisStartRound()")

            callContract();
            return;
          }
        }

        //合约被暂停
        if (paused) {
          logger.info("prediction has been pause")

          //unpause
          tx = await PredictionMarketV1ContractWithSign.unpause();
          await waitForTransaction(tx.hash);

          logger.info(`unpause(), tx ${tx.hash}`)
          logger.info("rerun genesisStartRound()")

          callContract();
          return;
        }
      } catch(e) {
        logger.info(`runingPrediction err: [${e}]`)
        callContract()
      }
    };

    callContract();
  });
}

runingPrediction()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error)
    process.exit(1)
  });
