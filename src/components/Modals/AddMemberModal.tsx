import { UserType, Group } from "@/types";

interface Props {
  group: Group;
  users: UserType[];
  onAddMember: (memberId: string) => void;
  onClose: () => void;
}

export default function AddMemberModal({ group, users, onAddMember, onClose }: Props) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-lg w-80">
        <h2 className="text-lg font-bold mb-4">Add Member to {group.name}</h2>

        <div className="max-h-60 overflow-y-auto space-y-2">
          {users
            .filter((u) => !group.members.includes(u.id))
            .map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              >
                <span>{u.username}</span>
                <button
                  className="text-sm bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                  onClick={() => onAddMember(u.id)}
                >
                  Add
                </button>
              </div>
            ))}
        </div>

        <button
          className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
