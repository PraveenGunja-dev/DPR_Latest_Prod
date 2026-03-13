import React, { useState } from "react";
import { BaseModal } from "./BaseModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Loader2, User, Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { registerUser } from "@/modules/auth/services/authService";

interface CreateUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    userRole?: string; // Current user's role (PMAG or Site PM)
    onUserCreated?: () => void;
}

type RoleOption = "supervisor" | "Site PM";

/**
 * CreateUserModal - Modal for creating new users with role-based options.
 * - PMAG can create both Supervisor and SitePM users
 * - SitePM can create only Supervisor users
 */
export const CreateUserModal: React.FC<CreateUserModalProps> = ({
    isOpen,
    onClose,
    userRole,
    onUserCreated
}) => {
    // Form state
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        role: "supervisor" as RoleOption
    });
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Determine available roles based on current user's role
    const availableRoles: { value: RoleOption; label: string }[] =
        userRole === "PMAG"
            ? [
                { value: "supervisor", label: "Supervisor" },
                { value: "Site PM", label: "Site PM" }
            ]
            : [
                { value: "supervisor", label: "Supervisor" }
            ];

    // Handle input change
    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // Clear error for this field
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: "" }));
        }
    };

    // Validate form
    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.name.trim()) {
            newErrors.name = "Name is required";
        }

        if (!formData.email.trim()) {
            newErrors.email = "Email is required";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = "Invalid email format";
        }

        if (!formData.password) {
            newErrors.password = "Password is required";
        } else if (formData.password.length < 8) {
            newErrors.password = "Password must be at least 8 characters";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Handle form submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        setLoading(true);
        try {
            await registerUser({
                Name: formData.name,
                Email: formData.email,
                password: formData.password,
                Role: formData.role
            });

            toast.success(`${formData.role === "supervisor" ? "Supervisor" : "Site PM"} created successfully!`);
            handleClose();
            onUserCreated?.();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create user");
        } finally {
            setLoading(false);
        }
    };

    // Reset form on close
    const handleClose = () => {
        setFormData({
            name: "",
            email: "",
            password: "",
            role: "supervisor"
        });
        setErrors({});
        onClose();
    };

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={handleClose}
            title="Create New User"
            description="Add a new user to the system"
            icon={<UserPlus size={20} />}
            maxWidth="max-w-md"
            footer={
                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={handleClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={loading}>
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            "Create User"
                        )}
                    </Button>
                </div>
            }
        >
            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Role Selection */}
                <div className="space-y-3">
                    <Label className="text-sm font-medium">User Role</Label>
                    <div className="flex gap-4">
                        {availableRoles.map((role) => (
                            <label
                                key={role.value}
                                className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all flex-1 ${formData.role === role.value
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:border-primary/50"
                                    }`}
                            >
                                <input
                                    type="radio"
                                    name="role"
                                    value={role.value}
                                    checked={formData.role === role.value}
                                    onChange={(e) => handleChange("role", e.target.value)}
                                    className="sr-only"
                                />
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${formData.role === role.value
                                        ? "border-primary"
                                        : "border-muted-foreground/30"
                                    }`}>
                                    {formData.role === role.value && (
                                        <div className="w-3 h-3 rounded-full bg-primary" />
                                    )}
                                </div>
                                <span className="font-medium text-foreground">{role.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Name */}
                <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <Input
                            id="name"
                            placeholder="Enter full name"
                            value={formData.name}
                            onChange={(e) => handleChange("name", e.target.value)}
                            className={`pl-9 ${errors.name ? "border-destructive" : ""}`}
                        />
                    </div>
                    {errors.name && (
                        <p className="text-xs text-destructive">{errors.name}</p>
                    )}
                </div>

                {/* Email */}
                <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <Input
                            id="email"
                            type="email"
                            placeholder="Enter email address"
                            value={formData.email}
                            onChange={(e) => handleChange("email", e.target.value)}
                            className={`pl-9 ${errors.email ? "border-destructive" : ""}`}
                        />
                    </div>
                    {errors.email && (
                        <p className="text-xs text-destructive">{errors.email}</p>
                    )}
                </div>

                {/* Password */}
                <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <Input
                            id="password"
                            type="password"
                            placeholder="Enter password (min. 8 characters)"
                            value={formData.password}
                            onChange={(e) => handleChange("password", e.target.value)}
                            className={`pl-9 ${errors.password ? "border-destructive" : ""}`}
                        />
                    </div>
                    {errors.password && (
                        <p className="text-xs text-destructive">{errors.password}</p>
                    )}
                </div>
            </form>
        </BaseModal>
    );
};
