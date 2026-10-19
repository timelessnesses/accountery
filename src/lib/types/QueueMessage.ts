import type { User } from "./AccountingDatabaseTypes";

export type NotificationMessage = {
    type: 'notification';
    data: {
        title: string;
        body: string;
        icon?: string;
        url?: string;
        destination: "all" | "students" | "admins" | User[];
        output: "all" | "push" | "email";
    }
}