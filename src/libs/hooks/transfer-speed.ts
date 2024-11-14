import {
  Accessor,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

type TransferSpeedOptions = {
  sampleInterval?: number;
  windowSize?: number;
};

/**
 * Calculate the average transfer speed based on the received bytes
 * @param transferredSize - The size of the transferred bytes
 * @param options - The options for the transfer speed
 * @returns The average transfer speed
 */
const createTransferSpeed = (
  transferredSize: Accessor<number>,
  options: TransferSpeedOptions = {},
) => {
  const { sampleInterval = 250, windowSize = 10 } = options;
  const [prevTransferred, setPrevTransferred] =
    createSignal<number>(transferredSize());
  const [prevTimestamp, setPrevTimestamp] =
    createSignal<number>(performance.now());
  const [speedSamples, setSpeedSamples] = createSignal<
    number[]
  >([]);
  let interval: number;
  const averageSpeed = createMemo<number | null>(() => {
    if (speedSamples().length > 0) {
      const avgSpeed =
        speedSamples().reduce(
          (acc, speed) => acc + speed,
          0,
        ) / speedSamples().length;
      return avgSpeed;
    } else {
      return null;
    }
  });

  const setSample = () => {
    const now = performance.now();
    const timeElapsed = (now - prevTimestamp()) / 1000;
    const transferredInLastInterval =
      transferredSize() - prevTransferred();
    if (timeElapsed > 0 && transferredInLastInterval >= 0) {
      const currentSpeed =
        transferredInLastInterval / timeElapsed;
      setSpeedSamples((prevSamples) => {
        const newSamples = [...prevSamples, currentSpeed];
        return newSamples.length > windowSize
          ? newSamples.slice(1)
          : newSamples;
      });
    }

    setPrevTransferred(transferredSize());
    setPrevTimestamp(now);
  };

  onMount(() => {
    setSample();
    interval = window.setInterval(
      setSample,
      sampleInterval,
    );
  });

  onCleanup(() => {
    window.clearInterval(interval);
  });

  return averageSpeed;
};

export default createTransferSpeed;
