"use client";

import { forwardRef, useImperativeHandle, useEffect, useState, useRef } from "react";
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, Timestamp } from "firebase/firestore";
import { db, rtdb, auth } from "@/firebaseConfig";
import CheckoutModal from "./CheckoutModal";
import BreakModal from "./BreakModal";
import { signOutUser } from "@/utils/auth";
import SuccessModal from "@/components/common/SuccessModal";


import { ref as rtdbRef, set as rtdbSet } from "firebase/database";

// Export the interface
export interface TimeManagementHandle {
    autoCheckIn: () => void;
}

interface TimeLog {
    id: string;
    type: "checkin" | "checkout" | "breakStart" | "breakEnd";
    breakType?: string;
    note?: string;
    timestamp: Timestamp;
}

const TimeManagement = forwardRef<TimeManagementHandle, { userId: string }>(({ userId }, ref) => {
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [currentStatus, setCurrentStatus] = useState<"offline" | "checkedIn" | "onBreak" | "checkedOut">("offline");
  const [clock, setClock] = useState(new Date());
  const [totalBreak, setTotalBreak] = useState(0);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const hasAutoCheckedIn = useRef(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // -----------------------
  // Real-time clock
  // -----------------------
  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // -----------------------
  // Fetch logs & calculate status
  // -----------------------
    useEffect(() => {
        const logsRef = collection(db, "timeLogs", userId, "logs");
        const q = query(logsRef, orderBy("timestamp", "asc"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as TimeLog));
        // Filter logs to today only
        const today = new Date();
        const filtered = data.filter(log => {
            const logDate = log.timestamp?.toDate();
            return logDate?.toDateString() === today.toDateString();
        });

        setLogs(filtered);

        // Set status based on last log
        if (!filtered.length) setCurrentStatus("offline");
        else {
            const last = filtered[filtered.length - 1];
            switch (last.type) {
            case "checkin":
                setCurrentStatus("checkedIn");
                break;
            case "breakStart":
                setCurrentStatus("onBreak");
                break;
            case "breakEnd":
                setCurrentStatus("checkedIn");
                break;
            case "checkout":
                setCurrentStatus("checkedOut");
                break;
            }
        }

        // Calculate total break
        let total = 0;
        let breakStartTime: Date | null = null;
        filtered.forEach((log) => {
            const logTime = log.timestamp?.toDate ? log.timestamp.toDate() : null;
            if (!logTime) return;

            if (log.type === "breakStart") breakStartTime = logTime;
            if (log.type === "breakEnd" && breakStartTime) {
            total += (logTime.getTime() - breakStartTime.getTime()) / 1000 / 60;
            breakStartTime = null;
            }
        });
        setTotalBreak(Math.round(total));
        });

        return () => unsubscribe();
    }, [userId]);

    // inside TimeManagement component
    const updateStatus = async (status: "online" | "onBreak" | "offline") => {
        const statusRef = rtdbRef(rtdb, `/status/${userId}`);
        await rtdbSet(statusRef, status);
    };

    // -----------------------
    // Add log function
    // -----------------------
    const addLog = async (type: TimeLog["type"], breakType?: string, note?: string) => {
        const data: any = { type, timestamp: serverTimestamp() };
        if (breakType) data.breakType = breakType;
        if (note) data.note = note;

        await addDoc(collection(db, "timeLogs", userId, "logs"), data);

        // Update currentStatus and Realtime DB
        switch (type) {
            case "checkin":
                setCurrentStatus("checkedIn");
                updateStatus("online");
                break;
            case "checkout":
                setCurrentStatus("checkedOut");
                updateStatus("offline");
                break;
            case "breakStart":
                setCurrentStatus("onBreak");
                updateStatus("onBreak");
                break;
            case "breakEnd":
                setCurrentStatus("checkedIn");
                updateStatus("online");
                break;
        }
    };

    // -----------------------
    // Auto check-in
    // -----------------------
    useImperativeHandle(ref, () => ({
        autoCheckIn: async () => {
        if (!hasAutoCheckedIn.current && currentStatus === "offline") {
            hasAutoCheckedIn.current = true;
            await addLog("checkin");
        }
        },
    }), [currentStatus]);

    // -----------------------
    // Auto check-in if offline
    // -----------------------
    useEffect(() => {
        if (!hasAutoCheckedIn.current && logs.length > 0) {
            const todayCheckin = logs.find((log) => log.type === "checkin");
            if (!todayCheckin && currentStatus === "offline") {
                hasAutoCheckedIn.current = true;
                addLog("checkin");
            }
        }
    }, [logs, currentStatus]);


  // -----------------------
  // Analog clock calculations
  // -----------------------

  const seconds = clock.getSeconds();
  const minutes = clock.getMinutes();
  const hours = clock.getHours() % 12;
  const secondDeg = seconds * 6;
  const minuteDeg = minutes * 6;
  const hourDeg = hours * 30 + minutes * 0.5;
  const dateOptions: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // -----------------------
  // JSX
  // -----------------------
  return (
    <div className="flex flex-col space-y-6 w-full max-w-2xl mx-auto p-4">
      {/* Clock Card */}
      <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-3xl shadow-xl text-white">
        <div className="relative w-40 h-40 rounded-full bg-white/20 flex items-center justify-center shadow-inner mb-4">
          <div className="w-36 h-36 rounded-full bg-white flex items-center justify-center relative">
            {/* Hour */}
            <div
              className="absolute bg-black rounded"
              style={{
                width: "4px",
                height: "30%",
                bottom: "50%",
                left: "50%",
                transform: `rotate(${hourDeg}deg)`,
                transformOrigin: "bottom center",
              }}
            />
            {/* Minute */}
            <div
              className="absolute bg-black rounded"
              style={{
                width: "3px",
                height: "45%",
                bottom: "50%",
                left: "50%",
                transform: `rotate(${minuteDeg}deg)`,
                transformOrigin: "bottom center",
              }}
            />
            {/* Second */}
            {/* <div
              className="absolute bg-red-500 rounded"
              style={{
                width: "2px",
                height: "50%",
                bottom: "50%",
                left: "50%",
                transform: `rotate(${secondDeg}deg)`,
                transformOrigin: "bottom center",
              }}
            /> */}
            {/* Center dot */}
            <div className="absolute w-4 h-4 bg-black rounded-full z-10" />
          </div>
        </div>
        <div className="text-4xl font-mono font-bold">{clock.toLocaleTimeString()}</div>
        <div className="mt-1 text-lg font-semibold">{clock.toLocaleDateString(undefined, dateOptions)}</div>
        <div className="mt-1 text-sm bg-white/20 px-3 py-1 rounded-full">
          Timezone: <span className="font-bold">{timeZone}</span>
        </div>
      </div>

      {/* Status Card */}
      <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow flex flex-col space-y-2">
        <div className="flex items-center space-x-2">
          <span
            className={`w-3 h-3 rounded-full ${
              currentStatus === "checkedIn"
                ? "bg-green-500"
                : currentStatus === "onBreak"
                ? "bg-yellow-400"
                : "bg-gray-400"
            }`}
          />
          <span>Status:{" "} <span className="capitalize font-semibold">{currentStatus === "checkedIn" ? "Online" : currentStatus === "onBreak" ? "On Break" : currentStatus}</span></span>
        </div>
        <div>Total Break Time: <span className="font-semibold">{totalBreak} min</span></div>
        {currentStatus === "checkedOut" && (
          <div className="text-sm text-gray-500 mt-1">Work session ended.</div>
        )}
      </div>

      {/* Action Buttons */}
      {/* <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow flex flex-wrap gap-2 justify-center">
        <button
          disabled={currentStatus !== "offline"}
          onClick={() => addLog("checkin")}
          className="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          Check In
        </button>
        <button
            disabled={!(currentStatus === "checkedIn" || currentStatus === "onBreak")}
            onClick={() => setShowCheckoutModal(true)}
            className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
            >
            Check Out
        </button>

        <button
          disabled={currentStatus !== "checkedIn"}
          onClick={() => setShowBreakModal(true)}
          className="px-3 py-2 bg-yellow-400 text-white rounded hover:bg-yellow-500 disabled:opacity-50"
        >
          Break In
        </button>
        <button
          disabled={currentStatus !== "onBreak"}
          onClick={() => addLog("breakEnd")}
          className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          Break Out
        </button>
      </div> */}

      <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow flex justify-between items-center">
        {/* Left side: Break buttons */}
        <div className="flex gap-2">
          <button
            disabled={currentStatus !== "checkedIn"}
            onClick={() => setShowBreakModal(true)}
            className="px-3 py-2 bg-yellow-400 text-white rounded hover:bg-yellow-500 disabled:opacity-50"
          >
            Break In
          </button>
          <button
            disabled={currentStatus !== "onBreak"}
            onClick={() => addLog("breakEnd")}
            className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            Break Out
          </button>
        </div>

        {/* Right side: Check Out */}
        <div>
          <button
            disabled={!(currentStatus === "checkedIn" || currentStatus === "onBreak")}
            onClick={() => setShowCheckoutModal(true)}
            className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
          >
            Check Out
          </button>
        </div>
      </div>


      {/* Logs */}
      <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow flex-1 overflow-y-auto">
        <h3 className="font-bold mb-2">Today’s Logs</h3>
        <ul className="text-sm space-y-1 max-h-60 overflow-y-auto">
          {logs.map((log) => (
            <li key={log.id}>
              {log.type} {log.breakType ? `- ${log.breakType}` : ""}{" "}
              {log.note ? `(${log.note})` : ""} - {log.timestamp?.toDate().toLocaleTimeString() || "Loading..."}
            </li>
          ))}
        </ul>
      </div>

      {/* Break Modal */}
      {showBreakModal && (
        <BreakModal
          onSubmit={async (breakType: string, note?: string) => {
            await addLog("breakStart", breakType, note);
            setShowBreakModal(false);
          }}
          onClose={() => setShowBreakModal(false)}
        />
      )}

      {showCheckoutModal && (
        <CheckoutModal
          onCancel={() => setShowCheckoutModal(false)}
          onConfirm={async () => {
            setShowCheckoutModal(false);

            try {
              await addLog("checkout");          // log checkout
              setShowSuccessModal(true);
              setTimeout(async () => {
                await signOutUser(userId);       // then logout after 1-2s
              }, 1500);
            } catch (err) {
              alert("Something went wrong during checkout.");
            }
          }}
        />
      )}

      {showSuccessModal && (
        <SuccessModal
          message="You have successfully checked out."
          onClose={() => setShowSuccessModal(false)}
        />
      )}


    </div>
  );
});
export default TimeManagement;