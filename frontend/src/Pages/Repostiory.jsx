import "./style/Repository.css";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Repository() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        name: "",
        description: "",
        visibility: "public",
        groupId: "",
        initialize: true,
        ignoreGitignore: false, // "No .gitignore" option
    });
    const [userGroups, setUserGroups] = useState([]);
    const [message, setMessage] = useState("");
    const [isError, setIsError] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
    const storedUsername = localStorage.getItem("username") || currentUser.username || currentUser.name || "Developer";
    const storedEmail = currentUser.gmail || currentUser.email || "";
    const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/+$/, "");

    useEffect(() => {
        async function fetchGroups() {
            try {
                const params = new URLSearchParams();
                if (storedUsername) params.append("username", storedUsername);
                if (storedEmail) params.append("email", storedEmail);
                const res = await fetch(`${API_BASE_URL}/api/groups/my-groups?${params.toString()}`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        setUserGroups(data);
                        if (data.length > 0 && !form.groupId) {
                            setForm((f) => ({ ...f, groupId: data[0]._id }));
                        }
                    }
                }
            } catch (err) {
                console.error("Error fetching user groups:", err);
            }
        }
        fetchGroups();
    }, [storedUsername, storedEmail]);

    function handleChange(event) {
        const { name, value, type, checked } = event.target;
        setForm((currentForm) => ({
            ...currentForm,
            [name]: type === "checkbox" ? checked : value,
        }));
        setMessage("");
        setIsError(false);
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setIsSubmitting(true);
        setMessage("");
        setIsError(false);
        const repoName = form.name.trim();

        const payload = {
            repositoryName: repoName,
            name: repoName,
            description: form.description,
            visibility: form.visibility,
            groupId: form.visibility === "Team Member" ? form.groupId : "",
            ignoreGitignore: form.ignoreGitignore,
            owner: storedUsername,
            ownerEmail: storedEmail,
            contributors: 1,
            commits: 1,
            status: "Active"
        };

        try {
            // Post directly to backend database collection 'repositories'
            let res = await fetch(`${API_BASE_URL}/api/repos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                // Navigate immediately to the User repositories page
                navigate("/User");
            } else {
                const errorData = await res.json().catch(() => ({}));
                setIsError(true);
                setMessage(`Failed to store repository in database: ${errorData.message || res.statusText}`);
            }
        } catch (err) {
            console.error("Backend error when saving repo:", err);
            setIsError(true);
            setMessage(`Database Error: Could not connect to backend server at ${API_BASE_URL} (${err.message}). Make sure the backend server is running.`);
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <main className="repository-page">
            <button className="back-link" type="button" onClick={() => navigate("/User")}>
                &lt;- Back to repositories
            </button>
            <section className="repository-form-card">
                <div className="repository-form-heading">
                    <p className="repository-eyebrow">NEW REPOSITORY</p>
                    <h1>Create a repository</h1>
                    <p>Set up a shared home for your project, issues, and future contributors.</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <label htmlFor="repository-name">Repository name</label>
                    <input
                        id="repository-name"
                        name="name"
                        type="text"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="e.g. design-system"
                        minLength={2}
                        required
                    />
                    <span className="field-hint">Use a short, memorable name for your project.</span>

                    <label htmlFor="repository-description">Description <span>(optional)</span></label>
                    <textarea
                        id="repository-description"
                        name="description"
                        value={form.description}
                        onChange={handleChange}
                        placeholder="What is this repository for?"
                        rows="4"
                    />

                    <fieldset>
                        <legend>Visibility</legend>
                        <label className="visibility-option">
                            <input type="radio" name="visibility" value="public" checked={form.visibility === "public"} onChange={handleChange} />
                            <span><strong>Public</strong><small>Anyone can see this repository.</small></span>
                        </label>
                        <label className="visibility-option">
                            <input type="radio" name="visibility" value="private" checked={form.visibility === "private"} onChange={handleChange} />
                            <span><strong>Private</strong><small>Only you and people you invite can see it.</small></span>
                        </label>
                        <label className="visibility-option">
                            <input type="radio" name="visibility" value="Team Member" checked={form.visibility === "Team Member"} onChange={handleChange} />
                            <span><strong>Team Member</strong><small>Only team members can see this repository.</small></span>
                        </label>
                    </fieldset>

                    {form.visibility === "Team Member" && (
                        <div style={{ marginBottom: "20px", background: "rgba(15, 29, 20, 0.7)", padding: "16px", borderRadius: "10px", border: "1px solid rgba(167, 221, 166, 0.2)" }}>
                            <label htmlFor="select-group" style={{ marginBottom: "8px", color: "#a7dda6" }}>Select Team / Joined Group</label>
                            {userGroups.length > 0 ? (
                                <select
                                    id="select-group"
                                    name="groupId"
                                    value={form.groupId}
                                    onChange={handleChange}
                                    style={{
                                        width: "100%",
                                        padding: "10px 12px",
                                        background: "#0f1d14",
                                        color: "#e7f1e5",
                                        border: "1px solid rgba(167, 221, 166, 0.3)",
                                        borderRadius: "8px",
                                        fontSize: "0.9rem"
                                    }}
                                >
                                    {userGroups.map((g) => (
                                        <option key={g._id} value={g._id}>
                                            {g.name} ({g.members ? g.members.length : 1} members)
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <p style={{ margin: "6px 0 0", color: "#e4bd71", fontSize: "0.85rem" }}>
                                    No joined groups found. <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={() => navigate("/teams")}>Create a team group first</span>.
                                </p>
                            )}
                        </div>
                    )}

                    <label className="checkbox-option">
                        <input type="checkbox" name="initialize" checked={form.initialize} onChange={handleChange} />
                        <span>Initialize this repository with a README</span>
                    </label>

                    {/* No .gitignore Option */}
                    <label className="checkbox-option" style={{ marginTop: "12px" }}>
                        <input
                            type="checkbox"
                            name="ignoreGitignore"
                            checked={form.ignoreGitignore}
                            onChange={handleChange}
                        />
                        <span>
                            <strong>No .gitignore</strong>
                            <small style={{ display: "block", color: "rgba(255,255,255,0.6)" }}>
                                Ignore .gitignore rules and include all files in the repository.
                            </small>
                        </span>
                    </label>

                    <div className="repository-form-actions">
                        <button className="cancel-button" type="button" onClick={() => navigate("/User")}>Cancel</button>
                        <button className="create-button" type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Storing in database..." : "Create repository"}
                        </button>
                    </div>
                    {message && (
                        <p
                            className="form-message"
                            role="status"
                            style={{ color: isError ? "#ef4444" : "#10b981", fontWeight: "600", marginTop: "16px" }}
                        >
                            {message}
                        </p>
                    )}
                </form>
            </section>
        </main>
    );

}
export default Repository;