"use client";

import { useState } from "react";
import { db } from "@/firebaseConfig";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function CreateGroup({ currentUserId }: { currentUserId: string }) {
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState(""); // comma separated IDs

  const createGroup = async () => {
    if (!groupName.trim()) return alert("Enter group name!");
    const memberArray = members.split(",").map(m => m.trim()).filter(Boolean);
    if (!memberArray.includes(currentUserId)) memberArray.push(currentUserId);

    await addDoc(collection(db, "groups"), {
      name: groupName,
      members: memberArray,
      createdBy: currentUserId,
      createdAt: serverTimestamp(),
    });

    alert("Group created!");
    setGroupName("");
    setMembers("");
  };

  return (
    <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
      <h2 className="font-bold mb-2 text-gray-900 dark:text-gray-100">Create New Group</h2>
      <input
        value={groupName}
        onChange={(e) => setGroupName(e.target.value)}
        placeholder="Group name"
        className="border p-2 rounded w-full mb-2"
      />
      <input
        value={members}
        onChange={(e) => setMembers(e.target.value)}
        placeholder="Member IDs (comma separated)"
        className="border p-2 rounded w-full mb-2"
      />
      <button
        onClick={createGroup}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg"
      >
        Create Group
      </button>
    </div>
  );
}
