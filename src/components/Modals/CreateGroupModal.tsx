import { useState } from "react";

interface Props {
  groupName: string;
  onChangeGroupName: (name: string) => void;
  onSubmit: (groupName: string, avatarUrl: string) => void;
  onClose: () => void;
}

const generateAvatar = (name: string) =>
  `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(name)}`;

export default function CreateGroupModal({
  groupName,
  onChangeGroupName,
  onSubmit,
  onClose,
}: Props) {
  const [customAvatar, setCustomAvatar] = useState("");

  const handleSubmit = () => {
    // Use custom avatar if provided, otherwise generate DiceBear
    const avatar = customAvatar.trim() || generateAvatar(groupName);
    onSubmit(groupName, avatar);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-lg w-80">
        <h2 className="text-lg font-bold mb-4">Create New Group</h2>

        <input
          type="text"
          placeholder="Group Name"
          className="w-full px-3 py-2 border rounded mb-2 dark:bg-gray-700 dark:text-white"
          value={groupName}
          onChange={(e) => onChangeGroupName(e.target.value)}
        />

        <input
          type="text"
          placeholder="Avatar URL (optional)"
          className="w-full px-3 py-2 border rounded mb-4 dark:bg-gray-700 dark:text-white"
          value={customAvatar}
          onChange={(e) => setCustomAvatar(e.target.value)}
        />

        <div className="flex justify-end space-x-2">
          <button
            className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white rounded hover:bg-gray-400"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            onClick={handleSubmit}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
