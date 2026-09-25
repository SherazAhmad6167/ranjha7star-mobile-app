package com.megster.cordova;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.UUID;
import java.util.Arrays;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.os.Bundle;
import android.os.Handler;
import android.os.Message;
import android.util.Log;

/**
 * Sets up and manages one outgoing Bluetooth SPP link: a thread that
 * connects, then a thread that reads while connected.
 *
 * Based on the Android SDK BluetoothChat sample via don/BluetoothSerial
 * 0.4.7, patched (see the plugin README):
 * - every runtime error on the worker threads is caught - an uncaught one
 *   (for example a SecurityException on Android 12+) used to kill the app;
 * - a thread that was cancelled on purpose exits quietly instead of reporting
 *   a failure that cancelled the *next* connect attempt;
 * - the Handler can be swapped, so one instance can outlive the plugin
 *   instance (and activity) that created it.
 */
public class BluetoothSerialService {

    // Debugging
    private static final String TAG = "BluetoothSerialService";
    private static final boolean D = true;

    // Well known SPP UUID
    private static final UUID UUID_SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    // Member fields
    private final BluetoothAdapter mAdapter;
    private volatile Handler mHandler;
    private ConnectThread mConnectThread;
    private ConnectedThread mConnectedThread;
    private int mState;

    // Constants that indicate the current connection state
    public static final int STATE_NONE = 0;       // we're doing nothing
    public static final int STATE_LISTEN = 1;     // unused: kept for the plugin's state switch
    public static final int STATE_CONNECTING = 2; // now initiating an outgoing connection
    public static final int STATE_CONNECTED = 3;  // now connected to a remote device

    /**
     * @param handler  Receives state changes and data; see {@link #setHandler}.
     */
    public BluetoothSerialService(Handler handler) {
        mAdapter = BluetoothAdapter.getDefaultAdapter();
        mState = STATE_NONE;
        mHandler = handler;
    }

    /** Points state changes and data at the current plugin instance. */
    public void setHandler(Handler handler) {
        mHandler = handler;
    }

    /** Stops reporting to `handler` - unless a newer plugin instance has already taken over. */
    public void clearHandler(Handler handler) {
        if (mHandler == handler) mHandler = null;
    }

    private synchronized void setState(int state) {
        if (D) Log.d(TAG, "setState() " + mState + " -> " + state);
        mState = state;

        Handler handler = mHandler;
        if (handler != null) {
            handler.obtainMessage(BluetoothSerial.MESSAGE_STATE_CHANGE, state, -1).sendToTarget();
        }
    }

    /** Return the current connection state. */
    public synchronized int getState() {
        return mState;
    }

    /**
     * Start the ConnectThread to initiate a connection to a remote device.
     * @param device  The BluetoothDevice to connect
     * @param secure Socket Security type - Secure (true) , Insecure (false)
     */
    public synchronized void connect(BluetoothDevice device, boolean secure) {
        if (D) Log.d(TAG, "connect to: " + device);

        // Only one link at a time: drop any attempt or link in progress.
        if (mConnectThread != null) {mConnectThread.cancel(); mConnectThread = null;}
        if (mConnectedThread != null) {mConnectedThread.cancel(); mConnectedThread = null;}

        mConnectThread = new ConnectThread(device, secure);
        setState(STATE_CONNECTING);
        mConnectThread.start();
    }

    /**
     * Start the ConnectedThread to begin managing a Bluetooth connection.
     * Ignored (and the socket closed) when `from` is no longer the current
     * attempt, i.e. stop() or a newer connect() replaced it meanwhile.
     */
    private synchronized void connected(ConnectThread from, BluetoothSocket socket, String socketType) {
        if (from != mConnectThread) {
            closeQuietly(socket);
            return;
        }
        if (D) Log.d(TAG, "connected, Socket Type:" + socketType);
        mConnectThread = null;

        if (mConnectedThread != null) {mConnectedThread.cancel(); mConnectedThread = null;}

        mConnectedThread = new ConnectedThread(socket, socketType);
        mConnectedThread.start();

        setState(STATE_CONNECTED);
    }

    /** Stop all threads and close the link. */
    public synchronized void stop() {
        if (D) Log.d(TAG, "stop");

        if (mConnectThread != null) {
            mConnectThread.cancel();
            mConnectThread = null;
        }

        if (mConnectedThread != null) {
            mConnectedThread.cancel();
            mConnectedThread = null;
        }
        setState(STATE_NONE);
    }

    /**
     * Write to the ConnectedThread in an unsynchronized manner.
     * @return false when there is no open link or the write failed
     */
    public boolean write(byte[] out) {
        ConnectedThread r;
        synchronized (this) {
            if (mState != STATE_CONNECTED || mConnectedThread == null) return false;
            r = mConnectedThread;
        }
        return r.write(out);
    }

    /** The connect attempt failed; reported unless it was cancelled on purpose. */
    private void connectionFailed(ConnectThread from) {
        synchronized (this) {
            if (from != mConnectThread) return;
            mConnectThread = null;
            setState(STATE_NONE);
        }
        sendToast("Unable to connect to device");
    }

    /** The open link dropped; reported unless it was closed on purpose. */
    private void connectionLost(ConnectedThread from) {
        synchronized (this) {
            if (from != mConnectedThread) return;
            mConnectedThread = null;
            setState(STATE_NONE);
        }
        sendToast("Device connection was lost");
    }

    private void sendToast(String text) {
        Handler handler = mHandler;
        if (handler == null) return;
        Message msg = handler.obtainMessage(BluetoothSerial.MESSAGE_TOAST);
        Bundle bundle = new Bundle();
        bundle.putString(BluetoothSerial.TOAST, text);
        msg.setData(bundle);
        handler.sendMessage(msg);
    }

    private static void closeQuietly(BluetoothSocket socket) {
        if (socket == null) return;
        try {
            socket.close();
        } catch (IOException e) {
            Log.e(TAG, "close() of socket failed", e);
        }
    }

    /**
     * This thread runs while attempting to make an outgoing connection
     * with a device. It runs straight through; the connection either
     * succeeds or fails.
     */
    private class ConnectThread extends Thread {
        private final BluetoothDevice mmDevice;
        private final boolean mmSecure;
        private final String mSocketType;
        private volatile BluetoothSocket mmSocket;
        private volatile boolean mmCanceled;

        public ConnectThread(BluetoothDevice device, boolean secure) {
            mmDevice = device;
            mmSecure = secure;
            mSocketType = secure ? "Secure" : "Insecure";
        }

        public void run() {
            Log.i(TAG, "BEGIN mConnectThread SocketType:" + mSocketType);
            setName("ConnectThread" + mSocketType);

            try {
                // Discovery slows a connect down. Cancelling it needs BLUETOOTH_SCAN
                // on Android 12+, which the app may not hold: carry on without.
                try {
                    mAdapter.cancelDiscovery();
                } catch (RuntimeException e) {
                    Log.w(TAG, "cancelDiscovery() not allowed", e);
                }

                BluetoothSocket socket = mmSecure
                    ? mmDevice.createRfcommSocketToServiceRecord(UUID_SPP)
                    : mmDevice.createInsecureRfcommSocketToServiceRecord(UUID_SPP);
                mmSocket = socket;
                if (mmCanceled) throw new IOException("Cancelled");

                try {
                    // Blocks until connected or failed.
                    Log.i(TAG, "Connecting to socket...");
                    socket.connect();
                } catch (IOException e) {
                    if (mmCanceled) throw e;
                    Log.e(TAG, e.toString());

                    // Some devices only answer on RFCOMM channel 1.
                    // See https://github.com/don/BluetoothSerial/issues/89
                    Log.i(TAG, "Trying fallback...");
                    closeQuietly(socket);
                    socket = (BluetoothSocket) mmDevice.getClass()
                        .getMethod("createRfcommSocket", int.class)
                        .invoke(mmDevice, 1);
                    mmSocket = socket;
                    if (mmCanceled) throw e;
                    socket.connect();
                }
                Log.i(TAG, "Connected");

                connected(this, socket, mSocketType);
            } catch (Exception e) {
                // IOException, a missing permission (SecurityException) or the
                // reflection fallback failing - all mean "could not connect".
                Log.e(TAG, "Couldn't establish a Bluetooth connection.", e);
                closeQuietly(mmSocket);
                connectionFailed(this);
            }
        }

        public void cancel() {
            mmCanceled = true;
            closeQuietly(mmSocket);
        }
    }

    /**
     * This thread runs during a connection with a remote device.
     * It handles all incoming and outgoing transmissions.
     */
    private class ConnectedThread extends Thread {
        private final BluetoothSocket mmSocket;
        private final InputStream mmInStream;
        private final OutputStream mmOutStream;

        public ConnectedThread(BluetoothSocket socket, String socketType) {
            Log.d(TAG, "create ConnectedThread: " + socketType);
            mmSocket = socket;
            InputStream tmpIn = null;
            OutputStream tmpOut = null;

            try {
                tmpIn = socket.getInputStream();
                tmpOut = socket.getOutputStream();
            } catch (IOException e) {
                Log.e(TAG, "temp sockets not created", e);
            }

            mmInStream = tmpIn;
            mmOutStream = tmpOut;
        }

        public void run() {
            Log.i(TAG, "BEGIN mConnectedThread");
            byte[] buffer = new byte[1024];

            try {
                if (mmInStream == null) throw new IOException("No input stream");

                // Keep listening to the InputStream while connected
                while (true) {
                    int bytes = mmInStream.read(buffer);
                    // -1 = the other side closed the link. Turning it into a String
                    // of length -1 used to crash the app here.
                    if (bytes < 0) throw new IOException("Stream closed");
                    if (bytes == 0) continue;

                    Handler handler = mHandler;
                    if (handler != null) {
                        handler.obtainMessage(BluetoothSerial.MESSAGE_READ, new String(buffer, 0, bytes)).sendToTarget();
                        // A copy: the buffer is reused for the next read.
                        handler.obtainMessage(BluetoothSerial.MESSAGE_READ_RAW, Arrays.copyOf(buffer, bytes)).sendToTarget();
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "disconnected", e);
                cancel();
                connectionLost(this);
            }
        }

        /**
         * Write to the connected OutStream.
         * @return false when the link is gone
         */
        public boolean write(byte[] buffer) {
            try {
                if (mmOutStream == null) throw new IOException("No output stream");
                mmOutStream.write(buffer);
                return true;
            } catch (IOException e) {
                Log.e(TAG, "Exception during write", e);
                // Closing the socket makes the reader thread report the loss.
                cancel();
                return false;
            }
        }

        public void cancel() {
            closeQuietly(mmSocket);
        }
    }
}
