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
      <div className="user_profile_page">
        <User_header />

        <div className="user_box clay_card">
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
    <div className="user_profile_page">
      <User_header />

      <div className="clay_profile_wrapper">
        {!isEditing ? (
          // ================= PROFILE VIEW =================
          <div className="profile_card_layout">
            <div className="box_user_profile clay_card">
              <img
                className="profile_img clay_avatar"
                src={imagePreview}
                alt="Profile"
              />

              <button className="clay_btn primary_clay" onClick={() => setIsEditing(true)}>
                Edit Profile
              </button>
            </div>

            <div className="user_box clay_card">
              <h1>{profileData.name}</h1>

              <div className="profile_detail_item">
                <strong>Email:</strong> <span>{profileData.email}</span>
              </div>

              <div className="profile_detail_item">
                <strong>Bio:</strong> <span>{profileData.bio || "No bio added"}</span>
              </div>

              <div className="profile_detail_item">
                <strong>Pronouns:</strong> <span>{profileData.pronouns}</span>
              </div>

              <div className="profile_detail_item">
                <strong>Company:</strong> <span>{profileData.company || "Not added"}</span>
              </div>

              <div className="profile_detail_item">
                <strong>Location:</strong> <span>{profileData.location || "Not added"}</span>
              </div>

              {profileData.website && (
                <div className="profile_detail_item">
                  <strong>Website:</strong> <span>{profileData.website}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          // ================= EDIT PROFILE =================
          <div className="edit_profile_container clay_card">
            <h2>Edit Profile</h2>

            {/* Profile Image */}
            <div className="edit_profile_image">
              <img
                src={imagePreview}
                alt="Profile"
                className="edit_profile_img clay_avatar"
              />

              <label className="change_photo_btn clay_btn">
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
              className="clay_input"
            />

            {/* Email */}
            <label>Email</label>
            <input
              type="email"
              value={profileData.email}
              disabled
              className="clay_input disabled"
            />

            {/* Bio */}
            <label>Bio</label>
            <textarea
              name="bio"
              value={profileData.bio}
              onChange={handleChange}
              placeholder="Add a bio"
              maxLength="160"
              className="clay_input"
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
              className="clay_input"
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
              className="clay_input"
            />

            {/* Location */}
            <label>Location</label>
            <input
              type="text"
              name="location"
              value={profileData.location}
              onChange={handleChange}
              placeholder="Location"
              className="clay_input"
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
              className="clay_input"
            />

            {/* Social Accounts */}
            <h3>Social accounts</h3>
            <input
              type="text"
              name="social1"
              value={profileData.social1}
              onChange={handleChange}
              placeholder="Link to social profile 1"
              className="clay_input"
            />
            <input
              type="text"
              name="social2"
              value={profileData.social2}
              onChange={handleChange}
              placeholder="Link to social profile 2"
              className="clay_input"
            />
            <input
              type="text"
              name="social3"
              value={profileData.social3}
              onChange={handleChange}
              placeholder="Link to social profile 3"
              className="clay_input"
            />
            <input
              type="text"
              name="social4"
              value={profileData.social4}
              onChange={handleChange}
              placeholder="Link to social profile 4"
              className="clay_input"
            />

            {/* Buttons */}
            <div className="edit_buttons">
              <button className="save_btn clay_btn success_clay" onClick={handleSave}>
                Save
              </button>
              <button className="cancel_btn clay_btn cancel_clay" onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default User_profile;