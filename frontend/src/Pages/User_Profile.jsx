import React, { useState } from "react";
import "./style/User_profile.css";
import User_header from "./User_header";
import profile from "./assert/profile.png";

function User_profile() {
  const savedUser = JSON.parse(localStorage.getItem("user"));

  const [isEditing, setIsEditing] = useState(false);

  const [profileData, setProfileData] = useState({
    name: savedUser?.username || "",
    email: savedUser?.gmail || "",
    bio: savedUser?.bio || "",
    pronouns: savedUser?.pronouns || "Don't specify",
    company: savedUser?.company || "",
    location: savedUser?.location || "",
    localTime: savedUser?.localTime || false,
    website: savedUser?.website || "",
    social1: savedUser?.social1 || "",
    social2: savedUser?.social2 || "",
    social3: savedUser?.social3 || "",
    social4: savedUser?.social4 || "",
    image: savedUser?.image || profile,
  });

  const [imagePreview, setImagePreview] = useState(
    savedUser?.image || profile
  );

  if (!savedUser) {
    return (
      <div>
        <User_header />

        <div className="user_box">
          <h2>Please login first</h2>
        </div>
      </div>
    );
  }

  // Handle input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setProfileData({
      ...profileData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  // Change profile image
  const handleImageChange = (e) => {
    const file = e.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      setImagePreview(reader.result);

      setProfileData({
        ...profileData,
        image: reader.result,
      });
    };

    reader.readAsDataURL(file);
  };

  // Save profile
  const handleSave = () => {
    const updatedUser = {
      ...savedUser,
      ...profileData,
      username: profileData.name,
    };

    localStorage.setItem("user", JSON.stringify(updatedUser));

    localStorage.setItem("username", profileData.name);

    setIsEditing(false);

    alert("Profile updated successfully!");
  };

  // Cancel
  const handleCancel = () => {
    setIsEditing(false);

    setProfileData({
      name: savedUser?.username || "",
      email: savedUser?.gmail || "",
      bio: savedUser?.bio || "",
      pronouns: savedUser?.pronouns || "Don't specify",
      company: savedUser?.company || "",
      location: savedUser?.location || "",
      localTime: savedUser?.localTime || false,
      website: savedUser?.website || "",
      social1: savedUser?.social1 || "",
      social2: savedUser?.social2 || "",
      social3: savedUser?.social3 || "",
      social4: savedUser?.social4 || "",
      image: savedUser?.image || profile,
    });

    setImagePreview(savedUser?.image || profile);
  };

  return (
    <div>
      <User_header />

      {!isEditing ? (
        // ================= PROFILE VIEW =================
        <>
          <div className="box_user_profile">

            <img
              className="profile_img"
              src={imagePreview}
              alt="Profile"
            />

            <button onClick={() => setIsEditing(true)}>
              Edit Profile
            </button>

          </div>

          <div className="user_box">

            <h1>{profileData.name}</h1>

            <p>
              <strong>Email:</strong> {profileData.email}
            </p>

            <p>
              <strong>Bio:</strong>{" "}
              {profileData.bio || "No bio added"}
            </p>

            <p>
              <strong>Pronouns:</strong> {profileData.pronouns}
            </p>

            <p>
              <strong>Company:</strong>{" "}
              {profileData.company || "Not added"}
            </p>

            <p>
              <strong>Location:</strong>{" "}
              {profileData.location || "Not added"}
            </p>

            {profileData.website && (
              <p>
                <strong>Website:</strong> {profileData.website}
              </p>
            )}

          </div>
        </>
      ) : (
        // ================= EDIT PROFILE =================
        <div className="edit_profile_container">

          <h2>Edit Profile</h2>

          {/* Profile Image */}
          <div className="edit_profile_image">

            <img
              src={imagePreview}
              alt="Profile"
              className="edit_profile_img"
            />

            <label className="change_photo_btn">
              Change Profile Photo

              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                hidden
              />
            </label>

          </div>

          {/* Name */}
          <label>Name</label>

          <input
            type="text"
            name="name"
            value={profileData.name}
            onChange={handleChange}
            placeholder="Name"
          />

          {/* Email */}
          <label>Email</label>

          <input
            type="email"
            value={profileData.email}
            disabled
          />

          {/* Bio */}
          <label>Bio</label>

          <textarea
            name="bio"
            value={profileData.bio}
            onChange={handleChange}
            placeholder="Add a bio"
            maxLength="160"
          />

          <small>
            You can @mention other users and organizations to link to them.
          </small>

          {/* Pronouns */}
          <label>Pronouns</label>

          <select
            name="pronouns"
            value={profileData.pronouns}
            onChange={handleChange}
          >
            <option value="Don't specify">Don't specify</option>
            <option value="He/Him">He/Him</option>
            <option value="She/Her">She/Her</option>
            <option value="They/Them">They/Them</option>
          </select>

          {/* Company */}
          <label>Company</label>

          <input
            type="text"
            name="company"
            value={profileData.company}
            onChange={handleChange}
            placeholder="Company"
          />

          {/* Location */}
          <label>Location</label>

          <input
            type="text"
            name="location"
            value={profileData.location}
            onChange={handleChange}
            placeholder="Location"
          />

          {/* Local Time */}
          <label className="checkbox_label">

            <input
              type="checkbox"
              name="localTime"
              checked={profileData.localTime}
              onChange={handleChange}
            />

            Display current local time

          </label>

          {/* Website */}
          <label>Website</label>

          <input
            type="text"
            name="website"
            value={profileData.website}
            onChange={handleChange}
            placeholder="Website"
          />

          {/* Social Accounts */}
          <h3>Social accounts</h3>

          <input
            type="text"
            name="social1"
            value={profileData.social1}
            onChange={handleChange}
            placeholder="Link to social profile 1"
          />

          <input
            type="text"
            name="social2"
            value={profileData.social2}
            onChange={handleChange}
            placeholder="Link to social profile 2"
          />

          <input
            type="text"
            name="social3"
            value={profileData.social3}
            onChange={handleChange}
            placeholder="Link to social profile 3"
          />

          <input
            type="text"
            name="social4"
            value={profileData.social4}
            onChange={handleChange}
            placeholder="Link to social profile 4"
          />

          {/* Buttons */}
          <div className="edit_buttons">

            <button
              className="save_btn"
              onClick={handleSave}
            >
              Save
            </button>

            <button
              className="cancel_btn"
              onClick={handleCancel}
            >
              Cancel
            </button>

          </div>

        </div>
      )}
    </div>
  );
}

export default User_profile;