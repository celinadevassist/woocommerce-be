const getUserAttreputes = (user) => {
  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    image: user.image,
    role: user.role,
    email: user.email,
    emailVerified: user.emailVerified || false, // Include email verification status
    mobile: user.mobile,
    location: user.location,
    socialLinks: user.socialLinks,
    bio: user.bio,
    preferredLanguage: user.preferredLanguage,
    lastActive: user.lastActive,
    visibleToCommunity: user.visibleToCommunity,
    skills: user.skills,
    credits: user.credits || 0,
    lastRechargeDate: user.lastRechargeDate || null,
    creditExpiryDate: user.creditExpiryDate || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

export default getUserAttreputes;
