export async function checkTurnServerAvailability(
  turnConfig: RTCIceServer,
  timeout = 10000,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    console.log("check turn server:", turnConfig);
    const configuration: RTCConfiguration = {
      iceServers: [turnConfig],
      iceTransportPolicy: "relay", // force to use TURN server only
    };

    const pc = new RTCPeerConnection(configuration);

    let isTurnAvailable = false;
    let isCompleted = false; // prevent multiple calls to resolve or reject

    // set timeout handler
    const timer = setTimeout(() => {
      if (!isCompleted) {
        isCompleted = true;
        console.warn("check turn server timeout");
        pc.close();
        reject(new Error("check turn server timeout"));
      }
    }, timeout);

    pc.onicecandidate = (event) => {
      if (event.candidate && event.candidate.candidate) {
        console.log(
          "collect ice candidate:",
          event.candidate.candidate,
        );
        if (
          event.candidate.type === "relay" ||
          event.candidate.candidate.includes("relay")
        ) {
          isTurnAvailable = true;
        }
      } else {
        // ICE candidate collection completed
        if (!isCompleted) {
          isCompleted = true;
          clearTimeout(timer);
          if (isTurnAvailable) {
            resolve(true);
          } else {
            console.warn("no relay candidate collected");
            reject(
              new Error("no relay candidate collected"),
            );
          }
          pc.close();
        }
      }
    };

    // Modify the error handler to not reject immediately
    pc.onicecandidateerror = (event) => {
      console.error("ice candidate error:", event);
      // Do not reject immediately, allow ICE gathering to continue
    };

    pc.createDataChannel("test"); // create data channel, trigger ICE collection

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch((error) => {
        console.error("create offer failed:", error);
        if (!isCompleted) {
          isCompleted = true;
          clearTimeout(timer);
          reject(error);
          pc.close();
        }
      });
  });
}
