// Apple Root CA - G3
// 来源：https://www.apple.com/certificateauthority/AppleRootCA-G3.cer （Apple PKI 页面 https://www.apple.com/certificateauthority/ ）
// 于 2026-10-01 直接从上述地址下载后用 openssl 核对：
//   Subject  : CN=Apple Root CA - G3, OU=Apple Certification Authority, O=Apple Inc., C=US
//   Not After: 2039-04-30 18:19:06 GMT
//   SHA-256  : 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
// Apple 页面本身不公布指纹，上面的指纹是对 apple.com 官方下载文件的计算值。
// 更新方法见 README「Apple 根证书的核对与更新」。

export const APPLE_ROOT_CA_G3_BASE64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

export const APPLE_ROOT_CA_G3_SHA256_HEX =
  "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";

// Apple 在 StoreKit / App Store Server 签名证书上使用的私有扩展 OID
// （与 apple/app-store-server-library-node 的 jws_verification.ts 一致）
export const OID_APPLE_LEAF = "1.2.840.113635.100.6.11.1"; // App Store 签名叶证书
export const OID_APPLE_INTERMEDIATE = "1.2.840.113635.100.6.2.1"; // Worldwide Developer Relations 中间 CA
