export function createAuthController({
  createUserAccount,
  authenticateAccount,
  getUserById,
  changePassword,
  deleteAccount,
  updateProfile,
}) {
  return {
    register: async (req, res) => {
      try {
        const session = await createUserAccount(req.body)
        res.status(201).json(session)
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message })
      }
    },

    login: async (req, res) => {
      try {
        const session = await authenticateAccount(req.body)
        res.json(session)
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message })
      }
    },

    me: async (req, res) => {
      try {
        const user = await getUserById(req.user.id)
        res.json({ user })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    },

    updatePassword: async (req, res) => {
      try {
        const session = await changePassword(req.user.id, req.body)
        res.json(session)
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message })
      }
    },

    updateProfile: async (req, res) => {
      try {
        const result = await updateProfile(req.user.id, req.body)
        res.json(result)
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message })
      }
    },

    removeAccount: async (req, res) => {
      try {
        const result = await deleteAccount(req.user.id, req.body)
        res.json(result)
      } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message })
      }
    },
  }
}
