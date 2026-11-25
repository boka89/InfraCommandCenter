# Restore a VM from backup

!!! warning
    Restoring overwrites the VM disk. Stop the VM first.

1. Open Proxmox → *Datacenter* → *Backup*.
2. Pick the newest backup of the VM and choose **Restore**.
3. Start the VM and check the service in ICC (*Monitor* → *Services*).

??? note "Command line"
    ```sh
    qmrestore /mnt/backup/vzdump-qemu-101-latest.vma.zst 101 --force
    ```

- [x] Backups run nightly
- [ ] Test a restore every quarter
