var capacitorCapacitorUpdater = (function (exports, core) {
    'use strict';

    const SocialLogin = core.registerPlugin("SocialLogin", {
        web: () => Promise.resolve().then(function () { return web; }).then((m) => new m.SocialLoginWeb()),
    });

    class SocialLoginWeb extends core.WebPlugin {
        constructor() {
            var _a;
            super();
            this.googleClientId = null;
            this.appleClientId = null;
            this.googleScriptLoaded = false;
            this.appleScriptLoaded = false;
            this.appleScriptUrl = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
            this.facebookAppId = null;
            this.facebookScriptLoaded = false;
            // Set up listener for OAuth redirects if we have a pending OAuth flow
            if (localStorage.getItem(SocialLoginWeb.OAUTH_STATE_KEY)) {
                console.log("OAUTH_STATE_KEY found");
                const result = this.handleOAuthRedirect();
                if (result) {
                    (_a = window.opener) === null || _a === void 0 ? void 0 : _a.postMessage(Object.assign({ type: "oauth-response" }, result.result), window.location.origin);
                    window.close();
                }
            }
        }
        handleOAuthRedirect() {
            const hash = window.location.hash.substring(1);
            console.log("handleOAuthRedirect", window.location.hash);
            if (!hash)
                return;
            console.log("handleOAuthRedirect ok");
            const params = new URLSearchParams(hash);
            const accessToken = params.get("access_token");
            const idToken = params.get("id_token");
            if (accessToken && idToken) {
                localStorage.removeItem(SocialLoginWeb.OAUTH_STATE_KEY);
                const profile = this.parseJwt(idToken);
                return {
                    provider: "google",
                    result: {
                        accessToken: {
                            token: accessToken,
                        },
                        idToken,
                        profile: {
                            email: profile.email || null,
                            familyName: profile.family_name || null,
                            givenName: profile.given_name || null,
                            id: profile.sub || null,
                            name: profile.name || null,
                            imageUrl: profile.picture || null,
                        },
                    },
                };
            }
            return null;
        }
        async initialize(options) {
            var _a, _b, _c;
            if ((_a = options.google) === null || _a === void 0 ? void 0 : _a.webClientId) {
                this.googleClientId = options.google.webClientId;
                await this.loadGoogleScript();
            }
            if ((_b = options.apple) === null || _b === void 0 ? void 0 : _b.clientId) {
                this.appleClientId = options.apple.clientId;
                await this.loadAppleScript();
            }
            if ((_c = options.facebook) === null || _c === void 0 ? void 0 : _c.appId) {
                this.facebookAppId = options.facebook.appId;
                await this.loadFacebookScript();
                FB.init({
                    appId: this.facebookAppId,
                    version: "v17.0",
                    xfbml: true,
                    cookie: true,
                });
            }
            // Implement initialization for other providers if needed
        }
        async login(options) {
            switch (options.provider) {
                case "google":
                    return this.loginWithGoogle(options.options);
                case "apple":
                    return this.loginWithApple(options.options);
                case "facebook":
                    return this.loginWithFacebook(options.options);
                default:
                    throw new Error(`Login for ${options.provider} is not implemented on web`);
            }
        }
        async logout(options) {
            switch (options.provider) {
                case "google":
                    // Google doesn't have a specific logout method for web
                    // We can revoke the token if we have it stored
                    console.log("Google logout: Token should be revoked on the client side if stored");
                    break;
                case "apple":
                    // Apple doesn't provide a logout method for web
                    console.log("Apple logout: Session should be managed on the client side");
                    break;
                case "facebook":
                    return new Promise((resolve) => {
                        FB.logout(() => resolve());
                    });
                default:
                    throw new Error(`Logout for ${options.provider} is not implemented`);
            }
        }
        async isLoggedIn(options) {
            switch (options.provider) {
                case "google":
                    // For Google, we can check if there's a valid token
                    // eslint-disable-next-line no-case-declarations
                    const googleUser = await this.getGoogleUser();
                    return { isLoggedIn: !!googleUser };
                case "apple":
                    // Apple doesn't provide a method to check login status on web
                    console.log("Apple login status should be managed on the client side");
                    return { isLoggedIn: false };
                case "facebook":
                    return new Promise((resolve) => {
                        FB.getLoginStatus((response) => {
                            resolve({ isLoggedIn: response.status === "connected" });
                        });
                    });
                default:
                    throw new Error(`isLoggedIn for ${options.provider} is not implemented`);
            }
        }
        async getAuthorizationCode(options) {
            switch (options.provider) {
                case "google":
                    // For Google, we can use the id_token as the authorization code
                    // eslint-disable-next-line no-case-declarations
                    const googleUser = await this.getGoogleUser();
                    if (googleUser === null || googleUser === void 0 ? void 0 : googleUser.credential) {
                        return { jwt: googleUser.credential };
                    }
                    throw new Error("No Google authorization code available");
                case "apple":
                    // Apple authorization code should be obtained during login
                    console.log("Apple authorization code should be stored during login");
                    throw new Error("Apple authorization code not available");
                case "facebook":
                    return new Promise((resolve, reject) => {
                        FB.getLoginStatus((response) => {
                            var _a;
                            if (response.status === "connected") {
                                resolve({ jwt: ((_a = response.authResponse) === null || _a === void 0 ? void 0 : _a.accessToken) || "" });
                            }
                            else {
                                reject(new Error("No Facebook authorization code available"));
                            }
                        });
                    });
                default:
                    throw new Error(`getAuthorizationCode for ${options.provider} is not implemented`);
            }
        }
        async refresh(options) {
            switch (options.provider) {
                case "google":
                    // For Google, we can prompt for re-authentication
                    await this.loginWithGoogle(options.options);
                    break;
                case "apple":
                    // Apple doesn't provide a refresh method for web
                    console.log("Apple refresh not available on web");
                    break;
                case "facebook":
                    await this.loginWithFacebook(options.options);
                    break;
                default:
                    throw new Error(`Refresh for ${options.provider} is not implemented`);
            }
        }
        loginWithGoogle(options) {
            if (!this.googleClientId) {
                throw new Error("Google Client ID not set. Call initialize() first.");
            }
            const scopes = options.scopes || ["email", "profile"];
            if (scopes.length > 0) {
                // If scopes are provided, directly use the traditional OAuth flow
                return this.fallbackToTraditionalOAuth(scopes);
            }
            return new Promise((resolve, reject) => {
                google.accounts.id.initialize({
                    client_id: this.googleClientId,
                    callback: (response) => {
                        console.log("google.accounts.id.initialize callback", response);
                        if (response.error) {
                            // we use any because type fail but we need to double check if that works
                            reject(response.error);
                        }
                        else {
                            const payload = this.parseJwt(response.credential);
                            const result = {
                                accessToken: null,
                                idToken: response.credential,
                                profile: {
                                    email: payload.email || null,
                                    familyName: payload.family_name || null,
                                    givenName: payload.given_name || null,
                                    id: payload.sub || null,
                                    name: payload.name || null,
                                    imageUrl: payload.picture || null,
                                },
                            };
                            resolve({ provider: "google", result });
                        }
                    },
                    auto_select: true,
                });
                google.accounts.id.prompt((notification) => {
                    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                        console.log("OneTap is not displayed or skipped");
                        // Fallback to traditional OAuth if One Tap is not available
                        this.fallbackToTraditionalOAuth(scopes)
                            .then((r) => resolve({ provider: "google", result: r.result }))
                            .catch(reject);
                    }
                    else {
                        console.log("OneTap is displayed");
                    }
                });
            });
        }
        parseJwt(token) {
            const base64Url = token.split(".")[1];
            const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
            const jsonPayload = decodeURIComponent(atob(base64)
                .split("")
                .map((c) => {
                return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
            })
                .join(""));
            return JSON.parse(jsonPayload);
        }
        async loadGoogleScript() {
            if (this.googleScriptLoaded)
                return;
            return new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = "https://accounts.google.com/gsi/client";
                script.async = true;
                script.onload = () => {
                    this.googleScriptLoaded = true;
                    resolve();
                };
                script.onerror = reject;
                document.body.appendChild(script);
            });
        }
        async loginWithApple(options) {
            if (!this.appleClientId) {
                throw new Error("Apple Client ID not set. Call initialize() first.");
            }
            if (!this.appleScriptLoaded) {
                throw new Error("Apple Sign-In script not loaded.");
            }
            return new Promise((resolve, reject) => {
                var _a;
                AppleID.auth.init({
                    clientId: this.appleClientId,
                    scope: ((_a = options.scopes) === null || _a === void 0 ? void 0 : _a.join(" ")) || "name email",
                    redirectURI: options.redirectUrl || window.location.href,
                    state: options.state,
                    nonce: options.nonce,
                    usePopup: true,
                });
                AppleID.auth
                    .signIn()
                    .then((res) => {
                    var _a, _b, _c, _d, _e, _f, _g;
                    const result = {
                        profile: {
                            user: ((_b = (_a = res.user) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.firstName)
                                ? `${res.user.name.firstName} ${res.user.name.lastName}`
                                : "",
                            email: ((_c = res.user) === null || _c === void 0 ? void 0 : _c.email) || null,
                            givenName: ((_e = (_d = res.user) === null || _d === void 0 ? void 0 : _d.name) === null || _e === void 0 ? void 0 : _e.firstName) || null,
                            familyName: ((_g = (_f = res.user) === null || _f === void 0 ? void 0 : _f.name) === null || _g === void 0 ? void 0 : _g.lastName) || null,
                        },
                        accessToken: {
                            token: res.authorization.code, // TODO: to fix and find the correct token
                        },
                        idToken: res.authorization.id_token || null,
                    };
                    resolve({ provider: "apple", result });
                })
                    .catch((error) => {
                    reject(error);
                });
            });
        }
        async loadAppleScript() {
            if (this.appleScriptLoaded)
                return;
            return new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = this.appleScriptUrl;
                script.async = true;
                script.onload = () => {
                    this.appleScriptLoaded = true;
                    resolve();
                };
                script.onerror = reject;
                document.body.appendChild(script);
            });
        }
        async getGoogleUser() {
            return new Promise((resolve) => {
                google.accounts.id.initialize({
                    client_id: this.googleClientId,
                    callback: (response) => {
                        resolve(response);
                    },
                });
                google.accounts.id.prompt((notification) => {
                    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                        resolve(null);
                    }
                });
            });
        }
        async loadFacebookScript() {
            if (this.facebookScriptLoaded)
                return;
            return new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = "https://connect.facebook.net/en_US/sdk.js";
                script.async = true;
                script.defer = true;
                script.onload = () => {
                    this.facebookScriptLoaded = true;
                    resolve();
                };
                script.onerror = reject;
                document.body.appendChild(script);
            });
        }
        async loginWithFacebook(options) {
            if (!this.facebookAppId) {
                throw new Error("Facebook App ID not set. Call initialize() first.");
            }
            return new Promise((resolve, reject) => {
                FB.login((response) => {
                    if (response.status === "connected") {
                        FB.api("/me", { fields: "id,name,email,picture" }, (userInfo) => {
                            var _a, _b;
                            const result = {
                                accessToken: {
                                    token: response.authResponse.accessToken,
                                    userId: response.authResponse.userID,
                                },
                                profile: {
                                    userID: userInfo.id,
                                    name: userInfo.name,
                                    email: userInfo.email || null,
                                    imageURL: ((_b = (_a = userInfo.picture) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.url) || null,
                                    friendIDs: [],
                                    birthday: null,
                                    ageRange: null,
                                    gender: null,
                                    location: null,
                                    hometown: null,
                                    profileURL: null,
                                },
                                idToken: null,
                            };
                            resolve({ provider: "facebook", result });
                        });
                    }
                    else {
                        reject(new Error("Facebook login failed"));
                    }
                }, { scope: options.permissions.join(",") });
            });
        }
        async fallbackToTraditionalOAuth(scopes) {
            const uniqueScopes = [...new Set([...scopes, "openid"])];
            const params = new URLSearchParams({
                client_id: this.googleClientId,
                redirect_uri: window.location.href,
                response_type: "token id_token",
                scope: uniqueScopes.join(" "),
                nonce: Math.random().toString(36).substring(2),
                include_granted_scopes: "true",
                state: "popup",
            });
            const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
            const width = 500;
            const height = 600;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;
            localStorage.setItem(SocialLoginWeb.OAUTH_STATE_KEY, "true");
            const popup = window.open(url, "Google Sign In", `width=${width},height=${height},left=${left},top=${top},popup=1`);
            return new Promise((resolve, reject) => {
                if (!popup) {
                    reject(new Error("Failed to open popup"));
                    return;
                }
                const handleMessage = (event) => {
                    var _a;
                    if (event.origin !== window.location.origin)
                        return;
                    if (((_a = event.data) === null || _a === void 0 ? void 0 : _a.type) === "oauth-response") {
                        window.removeEventListener("message", handleMessage);
                        const { accessToken, idToken } = event.data;
                        if (accessToken && idToken) {
                            const profile = this.parseJwt(idToken);
                            resolve({
                                provider: "google",
                                result: {
                                    accessToken: {
                                        token: accessToken.token,
                                    },
                                    idToken,
                                    profile: {
                                        email: profile.email || null,
                                        familyName: profile.family_name || null,
                                        givenName: profile.given_name || null,
                                        id: profile.sub || null,
                                        name: profile.name || null,
                                        imageUrl: profile.picture || null,
                                    },
                                },
                            });
                        }
                        else {
                            reject(new Error("Login failed"));
                        }
                    }
                };
                window.addEventListener("message", handleMessage);
                // Timeout after 5 minutes
                setTimeout(() => {
                    window.removeEventListener("message", handleMessage);
                    popup.close();
                    reject(new Error("OAuth timeout"));
                }, 300000);
            });
        }
    }
    SocialLoginWeb.OAUTH_STATE_KEY = "social_login_oauth_pending";

    var web = /*#__PURE__*/Object.freeze({
        __proto__: null,
        SocialLoginWeb: SocialLoginWeb
    });

    exports.SocialLogin = SocialLogin;

    return exports;

})({}, capacitorExports);
//# sourceMappingURL=plugin.js.map
