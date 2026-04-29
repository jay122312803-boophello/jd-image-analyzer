package com.jddecoder.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String ALIPAY_PACKAGE = "com.eg.android.AlipayGphone";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new JDNativeBridge(), "JDNative");
        }
    }

    private class JDNativeBridge {
        @JavascriptInterface
        public void openAlipay(String qrText) {
            runOnUiThread(() -> openAlipayFromQr(qrText));
        }
    }

    private void openAlipayFromQr(String qrText) {
        String value = qrText == null ? "" : qrText.trim();
        if (value.isEmpty()) {
            Toast.makeText(this, "二维码内容为空", Toast.LENGTH_SHORT).show();
            return;
        }

        String schemeUrl = value.startsWith("alipays://")
            ? value
            : "alipays://platformapi/startapp?saId=10000007&qrcode=" + Uri.encode(value);

        if (tryOpenUrl(schemeUrl, ALIPAY_PACKAGE)) return;
        if (tryOpenUrl(schemeUrl, null)) return;
        if (isHttpUrl(value) && tryOpenUrl(value, ALIPAY_PACKAGE)) return;
        if (isHttpUrl(value) && tryOpenUrl(value, null)) return;

        Toast.makeText(this, "未能唤起支付宝，请保存图片后在支付宝相册识别", Toast.LENGTH_LONG).show();
    }

    private boolean tryOpenUrl(String url, String packageName) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (packageName != null) {
                intent.setPackage(packageName);
            }
            startActivity(intent);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isHttpUrl(String value) {
        return value.startsWith("http://") || value.startsWith("https://");
    }
}
